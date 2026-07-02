import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge, getAgeAtYearOffset, getBirthYearFromAge, getBirthYear } from '../utils/age';
import { calculateRMD } from '../modules/rmd';
import { calculateFederalTax, determineTaxBracket } from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { calculateIRMAA, calculateIRMAAWithLookback } from '../modules/irmaa';
import { getEffectiveDeduction } from '@/lib/data/standard-deductions';
import { applyTaxCreditCarryforward } from '../utils/tax-credits';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '../utils/income';
import { resolveWithdrawalsForYear, earlyWithdrawalPenaltyOnIRA, netIraTargetForYear } from '../utils/withdrawals';
import { getMarginalBracket, computeTaxableIncomeWithSS } from '../tax-helpers';

/**
 * Run Baseline scenario: no Roth conversions, just RMDs
 *
 * Per specification:
 * - Interest = (B.O.Y. Balance - Distribution) × Rate
 * - E.O.Y. Balance = B.O.Y. Balance - Distribution + Interest
 * - Social Security taxation follows the standard provisional-income formula
 *   (up to 85% taxable). RMDs raise provisional income and can make more SS
 *   taxable, which is the "SS tax torpedo" effect visible in the baseline.
 * - IRMAA uses 2-year lookback
 *
 * RMD Treatment Options:
 * - 'spent': RMDs used for living expenses (not accumulated)
 * - 'reinvested': RMDs go to taxable account and earn interest (default)
 * - 'cash': RMDs accumulate in cash but don't earn interest
 *
 * Supports both legacy DOB-based approach and new age-based approach
 */
export function runBaselineScenario(
  client: Client,
  startYear: number,
  projectionYears: number
): YearlyResult[] {
  const results: YearlyResult[] = [];

  // Determine if using new age-based approach or legacy DOB approach
  const useAgeBased = client.age !== undefined && client.age > 0;
  const clientAge = useAgeBased ? client.age : (client.date_of_birth ? calculateAge(client.date_of_birth, startYear) : 62);
  const birthYear = useAgeBased
    ? getBirthYearFromAge(clientAge, startYear)
    : (client.date_of_birth ? getBirthYear(client.date_of_birth) : startYear - clientAge);

  // Use baseline_comparison_rate for baseline scenario (spec default: 7%)
  const growthRate = (client.baseline_comparison_rate ?? client.growth_rate ?? 7) / 100;

  // Initial balance - Baseline does NOT apply insurance product bonus
  let iraBalance = client.qualified_account_value ?? client.traditional_ira ?? 0;
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // Income history for IRMAA lookback
  const incomeHistory = new Map<number, number>();

  // SSI parameters (simplified: SSI treated as tax-exempt per spec)
  // Primary SSI
  const primarySsStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? client.ss_self ?? 0;

  // Spouse SSI (MFJ only)
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;

  // Spouse age tracking — only carry spouse data when the filer is actually
  // married. Stops a stale spouse_age from leaking into the year-by-year
  // table after an advisor switches a client back to single/HoH.
  const isMarriedFiler = client.filing_status === 'married_filing_jointly'
    || client.filing_status === 'married_filing_separately';
  const useSpouseAgeBased = isMarriedFiler
    && client.spouse_age !== undefined
    && client.spouse_age !== null
    && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;

  const ssiColaRate = 0.02; // 2% annual COLA per spec

  // State tax rate override (convert from percentage to decimal, null if not set)
  const stateTaxRateOverride = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : undefined;

  // RMD treatment option (default to 'reinvested' for backwards compatibility)
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';

  // Track cumulative after-tax distributions for 'spent' scenario
  let cumulativeAfterTaxDistributions = 0;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
    // Effective current spouse age — prefer the age-based value (the app's
    // primary input, and what SS COLA tracking below + the strategy engines
    // already use), falling back to spouse_dob only when no spouse_age was
    // entered. Previously this read spouse_dob ONLY, so age-based married
    // clients (the common case — most are entered by age, not DOB) silently
    // lost the spouse's age-65 senior standard-deduction bump, making baseline
    // tax higher than the strategy engines for identical income and skewing
    // the baseline-vs-strategy comparison.
    const spouseAge = initialSpouseAge !== null
      ? initialSpouseAge + yearOffset
      : (isMarriedFiler && client.spouse_dob ? calculateAge(client.spouse_dob, year) : null);

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;

    // Calculate the RMD requirement based on prior year-end balance.
    // SHORT-CIRCUIT: when rmds_handled_externally is true, the advisor is
    // modeling only part of the client's IRA and RMDs are being taken from
    // a bucket NOT modeled here — so we skip RMD entirely. All downstream
    // math (taxable income, treatment, balances) sees 0 and behaves as if
    // RMDs don't exist on this bucket. Baseline AND strategy gate the same
    // way so the comparison stays apples-to-apples.
    const rmdRequired = client.rmds_handled_externally
      ? 0
      : calculateRMD({ age, traditionalBalance: boyIRA, birthYear }).rmdAmount;

    // Voluntary withdrawals are resolved against the FULL IRA balance because
    // they SATISFY the RMD up to their amount (IRS rule: any qualifying
    // distribution counts toward that year's RMD; you don't take an RMD on
    // top of a larger voluntary distribution).
    const wd = resolveWithdrawalsForYear(client, year, boyIRA, boyRoth);
    let iraWithdrawal = wd.iraPulled;
    const rothWithdrawal = wd.rothPulled;

    // Net the voluntary against the RMD requirement:
    //   forcedRmdShortfall = how much extra forced distribution is needed
    //                        beyond what the voluntary already pulled
    //   effectiveIraDistribution = total taxable IRA distribution this year
    //                              = max(rmdRequired, iraWithdrawal)
    // Display field rmdAmount remains the LEGAL requirement (informative —
    // the "what the IRS demanded this year" column), unchanged by whether
    // voluntary covered it. The actual forced shortfall and total are
    // tracked internally for the math.
    let forcedRmdShortfall = Math.max(0, rmdRequired - iraWithdrawal);
    const rmdAmount = rmdRequired;
    let effectiveIraDistribution = iraWithdrawal + forcedRmdShortfall;

    // 10% early-withdrawal penalty applies only to voluntary IRA pulls under
    // 59.5 — at any age where an RMD requirement exists (73+), 59.5 is long
    // past, so there's no penalty interaction.
    let earlyPenalty = earlyWithdrawalPenaltyOnIRA(age, iraWithdrawal);

    // Primary SSI income (with COLA)
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    // Spouse SSI income (with COLA) - for MFJ
    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : (spouseAge ?? 0);
      const spouseYearsCollecting = currentSpouseAge >= spouseSsStartAge ? currentSpouseAge - spouseSsStartAge : -1;
      spouseSsIncome = spouseYearsCollecting >= 0
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, spouseYearsCollecting))
        : 0;
    }

    const ssIncome = primarySsIncome + spouseSsIncome;

    // Other taxable income (non-SSI) - year-specific from income table
    const otherIncome = getNonSSIIncomeForYear(client, year);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year);

    // Gross non-SSI income (drives provisional income for SS taxation).
    // Voluntary IRA withdrawals satisfy the RMD up to their amount, so the
    // taxable IRA distribution is max(rmdRequired, iraWithdrawal) =
    // effectiveIraDistribution — never the sum. Roth withdrawals are tax-free
    // (assumed qualified) and excluded.
    let grossTaxableIncome = effectiveIraDistribution + otherIncome;

    // Standard deduction (age-adjusted) + any advisor-entered additional deductions
    const deductions = getEffectiveDeduction(client.filing_status, age, spouseAge ?? undefined, year, client.additional_deductions);

    // NET (after-tax) withdrawal gross-up — BASELINE side only. If the advisor
    // marked this withdrawal as an after-tax target, solve for the gross IRA
    // pull that nets that amount after the marginal fed+state tax it triggers
    // (stacked on top of the forced RMD + other income, SS-torpedo aware), then
    // re-derive RMD satisfaction, penalty, and taxable income. The strategy side
    // pulls from the tax-free Roth (net == gross) so it is untouched. Clients
    // with no net-flagged withdrawal hit netTarget == 0 and stay byte-identical.
    const netTarget = netIraTargetForYear(client, year);
    if (netTarget > 0 && boyIRA > 0) {
      const stateOverride = stateTaxRateOverride;
      const taxAt = (voluntaryGross: number): number => {
        const dist = Math.max(rmdRequired, voluntaryGross);
        const ti = computeTaxableIncomeWithSS({
          otherIncome: dist + otherIncome,
          ssBenefits: ssIncome,
          taxExemptInterest: taxExemptNonSSI,
          deductions,
          filingStatus: client.filing_status,
        });
        const fed = calculateFederalTax({ taxableIncome: ti.taxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax;
        const st = calculateStateTax({ taxableIncome: ti.taxableIncome, state: client.state, filingStatus: client.filing_status, overrideRate: stateOverride }).totalTax;
        return fed + st;
      };
      // Marginal tax caused by the VOLUNTARY pull (above the forced RMD).
      const taxRmdOnly = taxAt(0);
      let g = netTarget;
      for (let i = 0; i < 12; i++) {
        const marginalVol = Math.max(0, taxAt(g) - taxRmdOnly);
        const netCash = g - marginalVol;
        const err = netTarget - netCash;
        if (Math.abs(err) < 100) break; // within $1
        const effRate = g > 0 ? Math.min(0.6, marginalVol / g) : 0.25;
        g += err / Math.max(0.2, 1 - effRate);
        if (g >= boyIRA) { g = boyIRA; break; }
        if (g < netTarget) g = netTarget;
      }
      iraWithdrawal = Math.min(Math.round(g), boyIRA);
      forcedRmdShortfall = Math.max(0, rmdRequired - iraWithdrawal);
      effectiveIraDistribution = iraWithdrawal + forcedRmdShortfall;
      earlyPenalty = earlyWithdrawalPenaltyOnIRA(age, iraWithdrawal);
      grossTaxableIncome = effectiveIraDistribution + otherIncome;
    }

    // Compute taxable income with proper SS taxation (tax torpedo).
    const taxInfo = computeTaxableIncomeWithSS({
      otherIncome: grossTaxableIncome,
      ssBenefits: ssIncome,
      taxExemptInterest: taxExemptNonSSI,
      deductions,
      filingStatus: client.filing_status,
    });
    const taxableIncome = taxInfo.taxableIncome;
    const agi = taxInfo.agi;

    // Federal tax
    const federalResult = calculateFederalTax({
      taxableIncome,
      filingStatus: client.filing_status,
      taxYear: year
    });

    // State tax (on taxable income)
    const stateResult = calculateStateTax({
      taxableIncome,
      state: client.state,
      filingStatus: client.filing_status,
      overrideRate: stateTaxRateOverride
    });

    // MAGI for IRMAA = AGI + tax-exempt interest + full SS (IRMAA uses gross SS,
    // not just the taxable portion).
    const magi = agi + taxExemptNonSSI + (ssIncome - taxInfo.taxableSS);

    // Store for IRMAA lookback
    incomeHistory.set(year, magi);

    // IRMAA (Medicare surcharge, age 65+ only, uses 2-year lookback).
    // Tier is captured from the SAME lookback as the surcharge so the
    // year-by-year "IRMAA Tier" and "IRMAA Amount" columns stay in sync —
    // previously the tier displayed the current-year MAGI's tier while the
    // dollar amount came from 2-year-old MAGI, producing confusing rows like
    // "Tier 4 / $0" in the first 2 projection years (no lookback data yet)
    // or "Standard / $9,240" after a conversion year aged out of the
    // lookback window.
    let irmaaSurcharge = 0;
    let irmaaTierFromLookback = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
      irmaaTierFromLookback = irmaaResult.tier;
    }

    // Total tax — federal + state + IRMAA + 10% early-withdrawal penalty for
    // any pre-59.5 voluntary IRA pull. RMDs themselves don't trigger the
    // penalty (RMD start age is well above 59.5).
    const totalTax = federalResult.totalTax + stateResult.totalTax + irmaaSurcharge + earlyPenalty;

    // Marginal federal tax attributable to the year's IRA distribution
    // (= the "Total Fed Tax on IRA W/D" display column). Mirrors the
    // calculation in growth-formula.ts so the column populates on the
    // baseline side too — previously baseline omitted this field entirely
    // and the column rendered blank, producing repeated support-chat
    // confusion (Marc Kraus, ticket 0e37beae). Computed as Tax(year with
    // IRA distribution) − Tax(year without). Skipped when there's no
    // distribution.
    let federalTaxOnIRAWithdrawal = 0;
    if (effectiveIraDistribution > 0) {
      const noIraTaxInfo = computeTaxableIncomeWithSS({
        otherIncome, // wages / non-SSI ordinary income only — no IRA $
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
      });
      const noIraFederalTax = calculateFederalTax({
        taxableIncome: noIraTaxInfo.taxableIncome,
        filingStatus: client.filing_status,
        taxYear: year,
      }).totalTax;
      federalTaxOnIRAWithdrawal = Math.max(0, federalResult.totalTax - noIraFederalTax);
    }

    // Calculate interest AFTER distribution.
    // Interest = (B.O.Y. Balance - Distribution) × Rate.
    // Distribution = max(rmdRequired, iraWithdrawal); see note above on the
    // RMD-satisfaction rule.
    const iraAfterDistribution = boyIRA - effectiveIraDistribution;
    const iraInterest = Math.round(iraAfterDistribution * growthRate);
    const rothAfterWithdrawal = boyRoth - rothWithdrawal;
    const rothInterest = Math.round(rothAfterWithdrawal * growthRate);

    // Taxable interest only applies in 'reinvested' mode
    const taxableInterest = rmdTreatment === 'reinvested'
      ? Math.round(boyTaxable * growthRate)
      : 0;

    // End of Year balances
    // E.O.Y. = B.O.Y. - Distribution + Interest. The voluntary withdrawal
    // amounts are presumed spent — they leave the portfolio entirely and
    // are NOT added back into the taxable account.
    iraBalance = iraAfterDistribution + iraInterest;
    rothBalance = rothAfterWithdrawal + rothInterest;

    // Taxable balance handling depends on RMD treatment option.
    //
    // The "forced RMD portion" is the shortfall the IRS forced out beyond
    // whatever the advisor scheduled as a voluntary withdrawal. Only this
    // forced portion is what rmd_treatment governs — the voluntary portion
    // is presumed spent regardless (matches the voluntary-withdrawal
    // semantics elsewhere in the engine).
    //
    // After-tax forced-RMD must use ONLY the tax attributable to that
    // portion, not the year's full totalTax — totalTax includes tax on
    // wages, SS, voluntary IRA pulls, and other income, which the client
    // pays out of THOSE income streams, not out of the forced RMD. Pro-rata
    // allocation by share of taxable income is approximate (a true marginal
    // calc would re-run the tax engine without the RMD), but it correctly
    // stops the previous behavior where a working retiree with $50K RMD
    // and $75K total tax saw afterTaxRmd clamp to 0.
    const forcedRmdShareOfTaxable = grossTaxableIncome > 0
      ? forcedRmdShortfall / grossTaxableIncome
      : 0;
    const forcedRmdAttributableTax = Math.round(totalTax * forcedRmdShareOfTaxable);
    const afterTaxForcedRmd = forcedRmdShortfall - forcedRmdAttributableTax;
    // Tax on income OTHER than the forced RMD (SS, wages, non-SSI income) is
    // funded by those income streams themselves — NOT drawn from the taxable
    // brokerage. An income source can always cover the tax on its own dollars
    // (marginal rate < 100%), so the outside income pays its own tax and the
    // leftover is spent on living expenses. Only the forced RMD's OWN
    // attributable tax reduces what reaches the brokerage (already netted out
    // in afterTaxForcedRmd above).
    //
    // This is the "option B" external-income credit. Previously the full
    // non-RMD tax was subtracted from the taxable account, which wiped out the
    // reinvested RMD and pinned taxableBalance at $0 every year for clients
    // with meaningful outside income — the reinvested RMDs never accumulated
    // (Marc Kraus, ticket 2a95f2e9: "RMDs not going to side account from the
    // first RMD year"). The earlier $0-clamp (Jorge V., ticket 809a5774) was
    // a band-aid over this same root cause; it now only acts as a defensive
    // floor and should virtually never bind.
    let desiredTaxableBalance: number;
    if (rmdTreatment === 'spent') {
      // Forced RMD is spent on living expenses - don't accumulate in taxable.
      // Track as distributions received (for Lifetime Wealth calculation).
      cumulativeAfterTaxDistributions += Math.max(0, afterTaxForcedRmd);
      // Taxable balance stays flat — same as before this fix.
      desiredTaxableBalance = boyTaxable;
    } else if (rmdTreatment === 'cash') {
      // Forced RMD (net of its own attributable tax) accumulates in cash but
      // doesn't earn interest.
      desiredTaxableBalance = boyTaxable + afterTaxForcedRmd;
    } else {
      // 'reinvested' (default): forced RMD (net of its own attributable tax)
      // flows into the taxable account and earns interest going forward.
      desiredTaxableBalance = boyTaxable + afterTaxForcedRmd + taxableInterest;
    }
    taxableBalance = Math.max(0, desiredTaxableBalance);

    // Determine tax bracket
    const bracket = determineTaxBracket(taxableIncome, client.filing_status, year);

    // Calculate extended fields for adjustable columns. irmaaTier mirrors
    // irmaaTierFromLookback above so the display column matches the
    // surcharge dollars on the same row.
    const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status, year);
    const irmaaTier = irmaaTierFromLookback;

    // Calculate growth/interest for each account
    const traditionalGrowth = iraInterest;
    const rothGrowth = rothInterest;
    const taxableGrowth = taxableInterest;

    // Tax component breakdown. Allocate federal/state tax proportionally
    // between ordinary income (RMD + other) and the taxable-SS portion.
    const ordinaryComponent = grossTaxableIncome;
    const ssComponent = taxInfo.taxableSS;
    const totalTaxableComponents = ordinaryComponent + ssComponent;
    const federalTaxOnSS = totalTaxableComponents > 0 && ssComponent > 0
      ? Math.round(federalResult.totalTax * ssComponent / totalTaxableComponents)
      : 0;
    const federalTaxOnOrdinaryIncome = federalResult.totalTax - federalTaxOnSS;
    const stateTaxOnSS = totalTaxableComponents > 0 && ssComponent > 0
      ? Math.round(stateResult.totalTax * ssComponent / totalTaxableComponents)
      : 0;
    const stateTaxOnOrdinaryIncome = stateResult.totalTax - stateTaxOnSS;

    const totalIncome = grossTaxableIncome + ssIncome;

    results.push({
      year,
      age,
      spouseAge,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount,
      conversionAmount: 0, // No conversions in baseline
      ssIncome,
      pensionIncome: 0, // Simplified - included in otherIncome
      otherIncome,
      totalIncome,
      federalTax: federalResult.totalTax,
      stateTax: stateResult.totalTax,
      niitTax: 0, // Simplified - not included in basic model
      irmaaSurcharge,
      totalTax,
      taxableSS: taxInfo.taxableSS,
      netWorth: iraBalance + rothBalance + taxableBalance,
      cumulativeDistributions: rmdTreatment === 'spent' ? cumulativeAfterTaxDistributions : undefined,
      // Extended fields for adjustable columns
      traditionalBOY: boyIRA,
      rothBOY: boyRoth,
      taxableBOY: boyTaxable,
      traditionalGrowth,
      rothGrowth,
      taxableGrowth,
      productBonusApplied: 0, // No bonus in baseline
      magi,
      agi,
      standardDeduction: deductions,
      taxableIncome,
      federalTaxBracket,
      irmaaTier,
      federalTaxOnSS,
      federalTaxOnConversions: 0, // No conversions in baseline
      federalTaxOnOrdinaryIncome,
      stateTaxOnSS,
      stateTaxOnConversions: 0, // No conversions in baseline
      stateTaxOnOrdinaryIncome,
      // Actual taxable IRA distribution = forced RMD shortfall + voluntary.
      // Voluntary already satisfies the RMD up to its amount, so this is
      // max(rmdRequired, iraWithdrawal) — never the additive sum.
      totalIRAWithdrawal: effectiveIraDistribution,
      federalTaxOnIRAWithdrawal,
      iraWithdrawal,
      rothWithdrawal,
      earlyWithdrawalPenalty: earlyPenalty || undefined,
    });
  }

  // Tax-credit carryforward pool — applied as a post-pass over the completed
  // results (no-op when the client has no credit). The "do nothing" baseline
  // gets the FULL pool too; it spreads thinly against small annual RMD taxes
  // (and may go partly unused), which is why a conversion strategy that front-
  // loads the credit against large conversion taxes extracts more value.
  applyTaxCreditCarryforward(results, client.tax_credits);

  return results;
}

/**
 * Calculate the annual interest on an account
 * Per specification: Interest = (B.O.Y. Balance - Distribution) × Rate
 */
export function calculateAnnualInterest(
  beginningBalance: number,
  distribution: number,
  rateOfReturn: number
): number {
  const balanceAfterDistribution = beginningBalance - distribution;
  return Math.round(balanceAfterDistribution * rateOfReturn);
}

/**
 * Calculate end of year balance
 * Per specification: E.O.Y. = B.O.Y. - Distribution + Interest
 */
export function calculateEndOfYearBalance(
  beginningBalance: number,
  distribution: number,
  interest: number
): number {
  return beginningBalance - distribution + interest;
}
