import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { calculateAge, getAgeAtYearOffset, getBirthYearFromAge } from '../utils/age';
import { calculateRMD } from '../modules/rmd';
import {
  calculateFederalTax,
  determineTaxBracket
} from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { calculateIRMAAWithLookback, calculateIRMAAHeadroom } from '../modules/irmaa';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '../utils/income';
import {
  getMarginalBracket,
  computeTaxableIncomeWithSS,
  calculateSSAwareOptimalConversion,
  calculateSSAwareIRAWithdrawalPlan,
  calculateConversionTaxWithSS,
} from '../tax-helpers';

/**
 * Run Formula scenario: strategic Roth conversions
 *
 * Per specification:
 * - Initial value = qualified_account_value × (1 + bonus_rate)
 * - Optimal conversion fills up to target bracket ceiling WITH Social Security
 *   taxation correctly accounted for (the "SS tax torpedo" — up to 85% of
 *   benefits become taxable once provisional income exceeds thresholds).
 * - Interest = (B.O.Y. Balance - Distribution) × Rate
 * - Conversion tax = (federal + state tax WITH conversion) − (federal + state
 *   tax WITHOUT conversion). Captures any extra tax from more SS becoming
 *   taxable once the conversion pushes provisional income higher.
 * - IRMAA uses 2-year lookback
 *
 * Supports both legacy DOB-based approach and new age-based approach
 */
export function runFormulaScenario(
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
    : (client.date_of_birth ? new Date(client.date_of_birth).getFullYear() : startYear - clientAge);

  // Use rate_of_return for formula scenario (spec default: 7%)
  const growthRate = (client.rate_of_return ?? client.growth_rate ?? 7) / 100;

  // Initial qualified account value
  const initialQualifiedValue = client.qualified_account_value ?? client.traditional_ira ?? 0;

  // Apply insurance product bonus
  // Per specification: formula_initial_value = qualified_account_value × (1 + bonus_rate)
  const bonusRate = (client.bonus_percent ?? 10) / 100;
  let iraBalance = Math.round(initialQualifiedValue * (1 + bonusRate));

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

  // Spouse age tracking
  // Only carry spouse data when the filer is actually married. Stops a stale
  // spouse_age from leaking into the year-by-year table after an advisor
  // switches a client back to single/HoH.
  const isMarriedFiler = client.filing_status === 'married_filing_jointly'
    || client.filing_status === 'married_filing_separately';
  const useSpouseAgeBased = isMarriedFiler
    && client.spouse_age !== undefined
    && client.spouse_age !== null
    && client.spouse_age > 0;
  const initialSpouseAge = useSpouseAgeBased ? client.spouse_age! : null;

  const ssiColaRate = 0.02; // 2% annual COLA per spec

  // Target bracket for conversions (default 24%)
  const maxTaxRate = client.max_tax_rate ?? 24;

  // State tax rate (as decimal for conversion tax calculation)
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);

  // Conversion timing
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;
  const conversionEndAge = client.end_age ?? 100; // Convert until end of projection

  // Tax payment source
  const payTaxFromIRA = client.tax_payment_source === 'from_ira';

  // Conversion strategy controls (must mirror growth-formula.ts so the legacy
  // dispatch path doesn't silently ignore advisor-selected conversion types).
  const conversionType = client.conversion_type ?? 'optimized_amount';
  const fixedConversionAmount = client.fixed_conversion_amount ?? 0;
  const targetPartialAmount = client.target_partial_amount ?? 0;
  const respectPenaltyFreeLimit = client.respect_penalty_free_limit ?? false;
  const penaltyFreePercent = client.penalty_free_percent ?? 10;
  // 'tax_only' (legacy default) caps only tax-from-IRA. 'all_distributions'
  // caps total outflow (conv + RMD + tax-from-IRA). See growth-formula.ts.
  const penaltyFreeScope = client.penalty_free_scope ?? 'tax_only';
  const surrenderYears = client.surrender_years ?? 0;
  // RMD treatment matters for the taxable-account update logic — see the
  // big comment further down where taxableBalance is set each year.
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';

  // Cumulative converted across the projection — used by 'partial_amount' to
  // cap total conversions across years.
  let cumulativeConverted = 0;

  // Track conversion completion
  let conversionComplete = false;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
    const spouseAge = isMarriedFiler && client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;
    const boyCombined = boyIRA + boyRoth;

    // RMD (Required Minimum Distribution) — kicks in at the SECURE-Act
    // age (73 for current cohorts). Conversions in the same year reduce
    // the IRA but RMDs come off conceptually first. Previously this engine
    // hardcoded rmdAmount: 0, silently letting the IRA grow past 73 with
    // no forced distributions — wrong for any client who converts past
    // RMD age. Other engines (growth-formula.ts, baseline.ts) compute it;
    // this fallback now matches them.
    // SHORT-CIRCUIT: rmds_handled_externally → skip RMDs entirely on this
    // bucket (split-bucket strategies; matches baseline.ts and growth-formula.ts).
    const rmdAmount = client.rmds_handled_externally
      ? 0
      : calculateRMD({ age, traditionalBalance: boyIRA, birthYear }).rmdAmount;
    const iraAfterRmd = boyIRA - rmdAmount;

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

    // Standard deduction (age-adjusted)
    const deductions = getStandardDeduction(client.filing_status, age, spouseAge ?? undefined, year);

    // Tax picture WITHOUT any conversion this year — used as the baseline for
    // marginal-conversion-tax math AND for tax owed in years we don't convert.
    // RMDs ARE part of the no-conversion ordinary income (forced distribution).
    const taxInfoNoConv = computeTaxableIncomeWithSS({
      otherIncome: otherIncome + rmdAmount,
      ssBenefits: ssIncome,
      taxExemptInterest: taxExemptNonSSI,
      deductions,
      filingStatus: client.filing_status,
    });
    const fedNoConv = calculateFederalTax({
      taxableIncome: taxInfoNoConv.taxableIncome,
      filingStatus: client.filing_status,
      taxYear: year,
    }).totalTax;
    const stateNoConv = calculateStateTax({
      taxableIncome: taxInfoNoConv.taxableIncome,
      state: client.state,
      filingStatus: client.filing_status,
      overrideRate: stateTaxRateDecimal,
    }).totalTax;

    // Determine conversion amount
    let conversionAmount = 0;
    let conversionTax = 0;
    let federalConversionTax = 0;
    let stateConversionTax = 0;

    // Carrier penalty-free cap during the surrender period (Allianz/American
    // Equity-style). Per advisor feedback (Joshua W., ticket 2b5ff7a4) the
    // cap restricts only the TAX dollars distributed out of the policy, not
    // the conversion itself (which is an intra-carrier Trad→Roth transfer).
    // The cap therefore only matters when tax is paid from the IRA. Anything
    // above the cap is funded externally (taxesPaidExternally on YearlyResult).
    // Mirrors the same logic in growth-formula.ts.
    const inSurrenderPeriod = yearOffset < surrenderYears;
    const taxCap = (respectPenaltyFreeLimit && inSurrenderPeriod && payTaxFromIRA)
      ? Math.round(boyIRA * penaltyFreePercent / 100)
      : Number.POSITIVE_INFINITY;
    // Outflow cap (strict 'all_distributions' scope): conv + RMD + tax all
    // count. RMD is mandatory so we subtract it from the cap first. The
    // remainder is the room for the conversion (and any tax from IRA).
    // Mirrors growth-formula.ts.
    const useOutflowCap =
      respectPenaltyFreeLimit &&
      inSurrenderPeriod &&
      penaltyFreeScope === 'all_distributions';
    const outflowCap = useOutflowCap
      ? Math.round(boyIRA * penaltyFreePercent / 100)
      : Number.POSITIVE_INFINITY;
    const conversionRoomUnderOutflowCap = useOutflowCap
      ? Math.max(0, outflowCap - rmdAmount)
      : Number.POSITIVE_INFINITY;
    const effectiveIraForConversion = Math.min(
      iraAfterRmd,
      conversionRoomUnderOutflowCap,
    );

    // Check if we should convert this year
    const shouldConvert = !conversionComplete &&
                          conversionType !== 'no_conversion' &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          effectiveIraForConversion > 100;

    // The IRA withdrawal taxable for the year. For external tax payment, only
    // the conversion is a taxable distribution. For internal tax payment, the
    // withheld tax is ALSO a taxable distribution (same 1099-R), so the full
    // conversion + tax-from-IRA is what the IRS sees.
    let totalIRAWithdrawal = 0;
    // True when the branch already produced authoritative tax numbers (planner
    // path or solved full/fixed) so we shouldn't recompute marginal tax below.
    let taxAlreadyComputed = false;

    if (shouldConvert) {
      // Branch on conversion strategy. Defaults match growth-formula.ts so
      // both engines respect the same advisor controls.
      if (conversionType === 'full_conversion') {
        if (payTaxFromIRA) {
          // Two regimes (mirrors growth-formula.ts):
          //   A — cap not binding (or ∞): conv + tax(conv) = effectiveIra.
          //   B — cap binding: conv = effectiveIra − taxCap, tax overflow external.
          // Detection: try Regime B; if the resulting tax indeed exceeds taxCap,
          // Regime B is correct. Otherwise fall through to Regime A.
          let useRegimeB = false;
          // Regime B (tax overflow → external) only applies in 'tax_only'
          // scope. In 'all_distributions' scope, effectiveIraForConversion
          // has already been bounded by the outflow cap, so Regime A's
          // conv + tax = effectiveIra solver naturally keeps total outflow
          // within the carrier allowance.
          if (taxCap !== Number.POSITIVE_INFINITY && !useOutflowCap) {
            const tryConv = Math.max(0, effectiveIraForConversion - taxCap);
            const tryTax = calculateConversionTaxWithSS({
              conversionAmount: tryConv,
              otherIncome,
              ssBenefits: ssIncome,
              taxExemptInterest: taxExemptNonSSI,
              deductions,
              filingStatus: client.filing_status,
              taxYear: year,
              state: client.state ?? 'CA',
              stateTaxRateDecimal,
            });
            if (tryTax.federalTax + tryTax.stateTax > taxCap) {
              conversionAmount = tryConv;
              federalConversionTax = tryTax.federalTax;
              stateConversionTax = tryTax.stateTax;
              totalIRAWithdrawal = conversionAmount + Math.min(taxCap, federalConversionTax + stateConversionTax);
              useRegimeB = true;
            }
          }
          if (!useRegimeB) {
            // Regime A — today's empty-the-IRA solver.
            let solved = effectiveIraForConversion * (1 - (maxTaxRate / 100 + stateTaxRateDecimal));
            for (let i = 0; i < 5; i++) {
              const t = calculateConversionTaxWithSS({
                conversionAmount: solved,
                otherIncome,
                ssBenefits: ssIncome,
                taxExemptInterest: taxExemptNonSSI,
                deductions,
                filingStatus: client.filing_status,
                taxYear: year,
                state: client.state ?? 'CA',
                stateTaxRateDecimal,
              });
              solved = effectiveIraForConversion - t.federalTax - t.stateTax;
            }
            conversionAmount = Math.max(0, Math.round(solved));
            const fcVerify = calculateConversionTaxWithSS({
              conversionAmount,
              otherIncome,
              ssBenefits: ssIncome,
              taxExemptInterest: taxExemptNonSSI,
              deductions,
              filingStatus: client.filing_status,
              taxYear: year,
              state: client.state ?? 'CA',
              stateTaxRateDecimal,
            });
            federalConversionTax = fcVerify.federalTax;
            stateConversionTax = fcVerify.stateTax;
            totalIRAWithdrawal = conversionAmount + federalConversionTax + stateConversionTax;
          }
          taxAlreadyComputed = true;
        } else {
          conversionAmount = effectiveIraForConversion;
          totalIRAWithdrawal = conversionAmount;
        }
      } else if (conversionType === 'fixed_amount' && fixedConversionAmount > 0) {
        if (payTaxFromIRA) {
          const estEffRate = maxTaxRate / 100 + stateTaxRateDecimal;
          const maxConvWithTax = Math.floor(effectiveIraForConversion / (1 + estEffRate));
          if (maxConvWithTax < fixedConversionAmount) {
            // Not enough room — solve like full_conversion against effectiveIra
            let solved = effectiveIraForConversion * (1 - estEffRate);
            for (let i = 0; i < 5; i++) {
              const t = calculateConversionTaxWithSS({
                conversionAmount: solved,
                otherIncome,
                ssBenefits: ssIncome,
                taxExemptInterest: taxExemptNonSSI,
                deductions,
                filingStatus: client.filing_status,
                taxYear: year,
                state: client.state ?? 'CA',
                stateTaxRateDecimal,
              });
              solved = effectiveIraForConversion - t.federalTax - t.stateTax;
            }
            conversionAmount = Math.max(0, Math.round(solved));
          } else {
            conversionAmount = fixedConversionAmount;
          }
          const fxVerify = calculateConversionTaxWithSS({
            conversionAmount,
            otherIncome,
            ssBenefits: ssIncome,
            taxExemptInterest: taxExemptNonSSI,
            deductions,
            filingStatus: client.filing_status,
            taxYear: year,
            state: client.state ?? 'CA',
            stateTaxRateDecimal,
          });
          federalConversionTax = fxVerify.federalTax;
          stateConversionTax = fxVerify.stateTax;
          totalIRAWithdrawal = conversionAmount + federalConversionTax + stateConversionTax;
          taxAlreadyComputed = true;
        } else {
          conversionAmount = Math.min(fixedConversionAmount, effectiveIraForConversion);
          totalIRAWithdrawal = conversionAmount;
        }
      } else if (conversionType === 'optimized_amount' || conversionType === 'partial_amount') {
        // partial_amount: same as optimized, but cap by remaining cumulative cap.
        const partialRemaining = conversionType === 'partial_amount'
          ? Math.max(0, targetPartialAmount - cumulativeConverted)
          : Number.POSITIVE_INFINITY;
        const cappedIra = Math.min(effectiveIraForConversion, partialRemaining);

        if (cappedIra <= 0) {
          // Cap exhausted — no conversion this year.
          conversionAmount = 0;
        } else if (payTaxFromIRA) {
          const plan = calculateSSAwareIRAWithdrawalPlan({
            iraBalance: cappedIra,
            otherIncome,
            ssBenefits: ssIncome,
            taxExemptInterest: taxExemptNonSSI,
            deductions,
            maxBracketRate: maxTaxRate,
            filingStatus: client.filing_status,
            taxYear: year,
            state: client.state,
            stateTaxRateDecimal,
          });
          conversionAmount = plan.conversion;
          totalIRAWithdrawal = plan.totalIRAWithdrawal;
          federalConversionTax = plan.federalTaxFromIRA;
          stateConversionTax = plan.stateTaxFromIRA;
          taxAlreadyComputed = true;
        } else {
          conversionAmount = calculateSSAwareOptimalConversion({
            iraBalance: cappedIra,
            otherIncome,
            ssBenefits: ssIncome,
            taxExemptInterest: taxExemptNonSSI,
            deductions,
            maxBracketRate: maxTaxRate,
            filingStatus: client.filing_status,
            taxYear: year,
          });
          totalIRAWithdrawal = conversionAmount;
        }
      }

      // For paths that haven't already produced authoritative tax numbers
      // (external-tax full/fixed/optimized/partial), compute the SS-aware
      // marginal conversion tax against the chosen conversion amount.
      if (conversionAmount > 0 && !taxAlreadyComputed) {
        const taxInfoWithConv = computeTaxableIncomeWithSS({
          otherIncome: otherIncome + conversionAmount,
          ssBenefits: ssIncome,
          taxExemptInterest: taxExemptNonSSI,
          deductions,
          filingStatus: client.filing_status,
        });
        const fedWithConv = calculateFederalTax({
          taxableIncome: taxInfoWithConv.taxableIncome,
          filingStatus: client.filing_status,
          taxYear: year,
        }).totalTax;
        const stateWithConv = calculateStateTax({
          taxableIncome: taxInfoWithConv.taxableIncome,
          state: client.state,
          filingStatus: client.filing_status,
          overrideRate: stateTaxRateDecimal,
        }).totalTax;
        federalConversionTax = Math.max(0, fedWithConv - fedNoConv);
        stateConversionTax = Math.max(0, stateWithConv - stateNoConv);
      }
      conversionTax = federalConversionTax + stateConversionTax;

      // Track cumulative converted for the partial cap.
      cumulativeConverted += conversionAmount;

      // Conversion is complete when nothing's left after the RMD AND this
      // year's conversion. Previously this checked boyIRA only, which
      // worked when rmdAmount was hardcoded to 0 but now needs to subtract
      // the RMD too or post-73 clients would loop forever.
      if (iraAfterRmd - conversionAmount <= 0) {
        conversionComplete = true;
      }
    }

    // Execute conversion. When payTaxFromIRA, the IRA funds the conversion
    // and the conversion tax — but the conversion tax is capped by the
    // carrier penalty-free allowance (taxCap) when active. Anything above the
    // cap is funded externally (taxesPaidExternally on YearlyResult). Mirror
    // of the same split in growth-formula.ts.
    const conversionTaxBeforeSplit = payTaxFromIRA ? (federalConversionTax + stateConversionTax) : 0;
    // In 'all_distributions' scope the conversion was already sized so
    // conv + tax fits under the outflow cap; nothing overflows externally.
    const conversionTaxFromIRA = payTaxFromIRA
      ? (useOutflowCap
          ? conversionTaxBeforeSplit
          : Math.min(taxCap, conversionTaxBeforeSplit))
      : 0;
    const conversionTaxExternal = payTaxFromIRA
      ? Math.max(0, conversionTaxBeforeSplit - conversionTaxFromIRA)
      : 0;
    // RMD has already been mentally pulled off the IRA above (iraAfterRmd).
    // Now the conversion + tax-from-IRA (capped) come off too.
    const iraAfterConversion = iraAfterRmd - conversionAmount - conversionTaxFromIRA;
    // Override the per-branch totalIRAWithdrawal so the IRS-visible 1099-R
    // amount matches what was actually distributed (conv + capped tax). The
    // recomputed federal/state tax below uses this value, so without this
    // override an advisor with the cap binding would see ordinary-income tax
    // computed against an IRA distribution larger than what physically left
    // the policy.
    totalIRAWithdrawal = conversionAmount + conversionTaxFromIRA;
    const rothAfterConversion = boyRoth + conversionAmount;

    // Interest = (B.O.Y. Balance − Distribution) × Rate
    const iraInterest = Math.round(iraAfterConversion * growthRate);
    const rothInterest = Math.round(rothAfterConversion * growthRate);

    // Final tax picture. The IRS sees the full IRA distribution (RMD +
    // conversion + any tax withheld from the IRA), so we pass them all
    // when computing the year's taxable income.
    const taxInfoFinal = (totalIRAWithdrawal + rmdAmount) > 0
      ? computeTaxableIncomeWithSS({
          otherIncome: otherIncome + rmdAmount + totalIRAWithdrawal,
          ssBenefits: ssIncome,
          taxExemptInterest: taxExemptNonSSI,
          deductions,
          filingStatus: client.filing_status,
        })
      : taxInfoNoConv;
    const federalResult = calculateFederalTax({
      taxableIncome: taxInfoFinal.taxableIncome,
      filingStatus: client.filing_status,
      taxYear: year,
    });
    const stateResult = calculateStateTax({
      taxableIncome: taxInfoFinal.taxableIncome,
      state: client.state,
      filingStatus: client.filing_status,
      overrideRate: stateTaxRateDecimal,
    });

    // MAGI for IRMAA uses full SS (taxable + non-taxable portions) plus all
    // IRA distributions (RMD + conversion + any tax-from-IRA). Without
    // including the RMD here, IRMAA tiers would be under-triggered for any
    // post-73 client.
    const grossIncomeWithWithdrawal = otherIncome + rmdAmount + totalIRAWithdrawal;
    const magi = grossIncomeWithWithdrawal + taxExemptNonSSI + ssIncome;
    incomeHistory.set(year, magi);

    // IRMAA surcharge + tier both come from the same 2-year-lookback MAGI
    // so the display column "IRMAA Tier" matches the "IRMAA Amount" cents
    // on the same row. See baseline.ts for the longer rationale.
    let irmaaSurcharge = 0;
    let irmaaTierFromLookback = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
      irmaaTierFromLookback = irmaaResult.tier;
    }

    // 10% early withdrawal penalty on tax paid from IRA when under 59.5
    const earlyWithdrawalPenalty =
      conversionTaxFromIRA > 0 && age < 60
        ? Math.round(conversionTaxFromIRA * 0.10)
        : 0;

    // Total tax this year = full federal + full state + IRMAA + penalty.
    // (Previously this was conversionTax only, which silently zeroed out tax
    // on any non-conversion ordinary income or taxable SS.)
    const totalTax = federalResult.totalTax + stateResult.totalTax + irmaaSurcharge + earlyWithdrawalPenalty;

    // End of Year balances
    iraBalance = iraAfterConversion + iraInterest;
    rothBalance = rothAfterConversion + rothInterest;

    // ---- Symmetric tax accounting between baseline and strategy ----
    // The taxable account previously absorbed every tax line in the strategy
    // (wage tax, SS tax, RMD tax) but the BASELINE engine only does that in
    // 'cash'/'reinvested' modes — in 'spent' mode the baseline keeps taxable
    // flat (baseline.ts:217). That asymmetry punished any 'spent'-mode client
    // who had real wages or other taxable income before/during their
    // conversion phase. Fix: in 'spent' mode only deduct conversion-related
    // tax that's genuinely paid from external/taxable funds. Non-conversion
    // tax (wages, SS, RMD) is paid from the income that generated it and
    // exists identically in both scenarios. In 'cash'/'reinvested' modes,
    // baseline also deducts the full totalTax (lines 220/223 of baseline.ts)
    // so we keep the legacy behavior there to stay symmetric.
    const conversionFedStateTax = federalConversionTax + stateConversionTax;
    const taxFromTaxableAccount = rmdTreatment === 'spent'
      ? (payTaxFromIRA ? 0 : conversionFedStateTax)
      : (payTaxFromIRA ? Math.max(0, totalTax - conversionTaxFromIRA) : totalTax);
    // RMD proceeds either get spent (don't accumulate) or go to taxable
    // account ('reinvested'/'cash'). Mirrors growth-formula.ts. Clamp at $0
    // (Jorge V., ticket 809a5774) so that residual tax bills, once the
    // qualified buckets are drained, are assumed paid from external income
    // (SS / non_ssi_income) rather than driving taxableBalance into the
    // negatives. TODO: replace with proper external-income credit (option B).
    const desiredTaxableBalance = rmdTreatment === 'spent'
      ? boyTaxable - taxFromTaxableAccount
      : boyTaxable + rmdAmount - taxFromTaxableAccount;
    taxableBalance = Math.max(0, desiredTaxableBalance);

    // Split federal/state tax between "on conversion" and "on ordinary/SS income"
    // for display breakdowns. Ordinary portion is what remains after subtracting
    // the marginal conversion tax.
    const federalTaxOnOrdinaryAndSS = Math.max(0, federalResult.totalTax - federalConversionTax);
    const stateTaxOnOrdinaryAndSS = Math.max(0, stateResult.totalTax - stateConversionTax);

    const bracket = determineTaxBracket(taxInfoFinal.taxableIncome, client.filing_status, year);
    const totalIncome = grossIncomeWithWithdrawal + ssIncome;
    const irmaaTier = irmaaTierFromLookback;
    const federalTaxBracket = getMarginalBracket(taxInfoFinal.taxableIncome, client.filing_status, year);

    results.push({
      year,
      age,
      spouseAge,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount,
      conversionAmount,
      ssIncome,
      pensionIncome: 0,
      otherIncome,
      totalIncome,
      federalTax: federalResult.totalTax,
      stateTax: stateResult.totalTax,
      niitTax: 0,
      irmaaSurcharge,
      totalTax,
      taxableSS: taxInfoFinal.taxableSS,
      netWorth: iraBalance + rothBalance + taxableBalance,
      // Extended fields for adjustable columns
      traditionalBOY: boyIRA,
      rothBOY: boyRoth,
      taxableBOY: boyTaxable,
      traditionalGrowth: iraInterest,
      rothGrowth: rothInterest,
      taxableGrowth: 0, // No growth on taxable (just pays taxes)
      productBonusApplied: 0, // Bonus applied at year 0 only (in initial balance)
      magi,
      agi: taxInfoFinal.agi,
      standardDeduction: deductions,
      taxableIncome: taxInfoFinal.taxableIncome,
      federalTaxBracket,
      irmaaTier,
      // Rough attribution: tax on SS is the share of ordinary/SS tax
      // proportional to how much of ordinary+SS taxable income is SS.
      federalTaxOnSS: taxInfoFinal.taxableSS > 0 && (otherIncome + taxInfoFinal.taxableSS) > 0
        ? Math.round(federalTaxOnOrdinaryAndSS * taxInfoFinal.taxableSS / (otherIncome + taxInfoFinal.taxableSS))
        : 0,
      federalTaxOnConversions: federalConversionTax,
      federalTaxOnOrdinaryIncome: taxInfoFinal.taxableSS > 0 && (otherIncome + taxInfoFinal.taxableSS) > 0
        ? Math.round(federalTaxOnOrdinaryAndSS * otherIncome / (otherIncome + taxInfoFinal.taxableSS))
        : federalTaxOnOrdinaryAndSS,
      stateTaxOnSS: taxInfoFinal.taxableSS > 0 && (otherIncome + taxInfoFinal.taxableSS) > 0
        ? Math.round(stateTaxOnOrdinaryAndSS * taxInfoFinal.taxableSS / (otherIncome + taxInfoFinal.taxableSS))
        : 0,
      stateTaxOnConversions: stateConversionTax,
      stateTaxOnOrdinaryIncome: taxInfoFinal.taxableSS > 0 && (otherIncome + taxInfoFinal.taxableSS) > 0
        ? Math.round(stateTaxOnOrdinaryAndSS * otherIncome / (otherIncome + taxInfoFinal.taxableSS))
        : stateTaxOnOrdinaryAndSS,
      // The IRS sees the full IRA distribution this year — RMD + conversion +
      // any tax pulled from the IRA. Stored field reflects all three so
      // downstream display (Conversion Details, etc.) shows the correct
      // gross distribution number.
      totalIRAWithdrawal: rmdAmount + totalIRAWithdrawal,
      taxesPaidFromIRA: conversionTaxFromIRA,
      taxesPaidExternally: conversionTaxExternal,
      earlyWithdrawalPenalty,
    });
  }

  return results;
}

/**
 * Calculate combined account interest for formula scenario
 * Per specification, interest accrues on both IRA and Roth after conversion
 */
export function calculateFormulaInterest(
  iraBeginning: number,
  conversionAmount: number,
  rothBeginning: number,
  rateOfReturn: number
): { iraInterest: number; rothInterest: number; totalInterest: number } {
  // IRA earns interest on remaining balance after conversion
  const iraAfterConversion = iraBeginning - conversionAmount;
  const iraInterest = Math.round(iraAfterConversion * rateOfReturn);

  // Roth earns interest on beginning balance + new conversion
  const rothAfterConversion = rothBeginning + conversionAmount;
  const rothInterest = Math.round(rothAfterConversion * rateOfReturn);

  return {
    iraInterest,
    rothInterest,
    totalInterest: iraInterest + rothInterest
  };
}
