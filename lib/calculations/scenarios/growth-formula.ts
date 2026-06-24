import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset, getBirthYear } from '../utils/age';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { getEffectiveDeduction } from '@/lib/data/standard-deductions';
import { applyTaxCreditCarryforward } from '../utils/tax-credits';
import { getStateTaxRate } from '@/lib/data/states';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '../utils/income';
import { calculateIRMAAWithLookback, calculateIRMAAHeadroom, calculateIRMAAHeadroomToTarget } from '../modules/irmaa';
import {
  calculateMAGI,
  getMarginalBracket,
  computeTaxableIncomeWithSS,
  calculateSSAwareOptimalConversion,
  calculateSSAwareIRAWithdrawalPlan,
  calculateConversionTaxWithSS,
} from '../tax-helpers';
import { calculateRMD } from '../modules/rmd';
import { ALL_PRODUCTS, type FormulaType } from '@/lib/config/products';
import { getEffectiveGrowthRiderFee } from '../resolvers/product-resolver';
import { resolveWithdrawalsForYear, earlyWithdrawalPenaltyOnIRA } from '../utils/withdrawals';
import type { CustomProductRow } from '@/lib/products/types';

/**
 * Run Growth FIA Formula scenario: Roth conversions with FIA product features
 *
 * Implements the Growth FIA calculation logic:
 * - Applies upfront bonus at issue (using client.bonus_percent)
 * - Strategic Roth conversions (optimized, fixed amount, or full)
 * - Compound growth at rate_of_return
 * - Anniversary bonus on remaining IRA balance (years 1-3)
 * - Surrender value calculation based on surrender schedule
 * - Tax calculation on conversions
 *
 * Order of operations each year:
 * 1. Conversion (reduce IRA, increase Roth)
 * 2. Growth (apply rate_of_return)
 * 3. Anniversary bonus (apply to IRA if within bonus years)
 * 4. Surrender value (apply surrender charge to IRA)
 */
export function runGrowthFormulaScenario(
  client: Client,
  startYear: number,
  projectionYears: number,
  customProduct?: CustomProductRow | null
): YearlyResult[] {
  const results: YearlyResult[] = [];

  const clientAge = client.age ?? 62;
  const contractRate = (client.rate_of_return ?? 7) / 100;
  // Post-contract rate: rate applied after the surrender period ends.
  // Defaults to the contract rate if not set (renewal rate assumption).
  const postContractRate = ((client.post_contract_rate ?? client.rate_of_return ?? 7)) / 100;

  // Apply upfront premium bonus at issue
  const bonusPercent = client.bonus_percent ?? 0;
  const initialValue = client.qualified_account_value ?? 0;
  // Principal protection floor: if enabled, the annuity AV can never drop
  // below the initial premium (less any cumulative withdrawals/conversions).
  // This is the standard FIA principal-protection guarantee.
  const protectInitialPremium = client.protect_initial_premium === true;
  // Industry standard FIA guarantee protects premium + upfront bonus, not just
  // the pre-bonus deposit. This matches the iraBalance starting value below.
  const initialPremium = Math.round(initialValue * (1 + bonusPercent / 100));
  let cumulativeWithdrawn = 0; // conversions + RMDs + taxes taken from IRA
  let iraBalance = Math.round(initialValue * (1 + bonusPercent / 100));
  // Read client's EXISTING Roth + Taxable balances so the Growth FIA engine
  // matches the symmetry already present in baseline.ts / formula.ts / GI
  // engine. Without this, advisors with clients who have pre-existing Roth
  // or brokerage balances saw the strategy side under-count those buckets
  // (rothBalance ignored compound growth on their existing Roth, and the
  // taxable account was treated as "phantom external" funds for conversion
  // taxes instead of the real money sitting on the client's balance sheet).
  // Roth balance compounds via rothInterest (~line 588), so starting it at
  // the client's value lets the existing Roth grow tax-free alongside any
  // conversions. Taxable balance does NOT yet have interest applied in this
  // engine (unlike baseline.ts) — it's a tax-flow tracker that drains by
  // conversion tax + grows by RMD reinvestment. Starting it at the client's
  // real value lets the engine honestly model conversion taxes draining the
  // brokerage, instead of pretending those dollars came from nowhere.
  // TODO: add taxableInterest to this engine to fully mirror baseline.ts's
  // taxable-bucket semantics. Left out of this change to keep blast radius
  // scoped and predictable.
  let rothBalance = client.roth_ira ?? 0;
  let taxableBalance = client.taxable_accounts ?? 0;

  // Look up the product preset early so we can fall back to preset defaults
  // when the client record is missing fields. This guards against legacy
  // client rows saved before the picker reliably populated anniversary fields —
  // without the fallback, a Phased Bonus Growth client with null anniversary
  // values would silently model as a no-anniversary product.
  const productConfig = ALL_PRODUCTS[client.blueprint_type as FormulaType];
  const presetAnnivBonus = productConfig?.defaults.anniversaryBonus ?? null;
  const presetAnnivYears = productConfig?.defaults.anniversaryBonusYears ?? null;

  // Anniversary bonus (e.g., Phased Bonus Growth: 4% at end of years 1, 2, 3).
  // Prefer the value on the client record (advisor may have customized it),
  // otherwise fall back to the preset default.
  const anniversaryBonusPercent =
    ((client.anniversary_bonus_percent ?? presetAnnivBonus) ?? 0) / 100;
  const anniversaryBonusYears =
    (client.anniversary_bonus_years ?? presetAnnivYears) ?? 0;

  // Surrender schedule (array of charge percentages by year)
  const surrenderSchedule = client.surrender_schedule ?? null;

  // Rider fee — custom product overrides the system preset when present.
  // Only applied during the surrender period.
  const riderFeePercent = getEffectiveGrowthRiderFee(
    client.blueprint_type as FormulaType,
    customProduct
  );
  const surrenderYears = client.surrender_years ?? 0;

  // SSI parameters (per spec, SSI is treated as tax-exempt but still displayed)
  const primarySsStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? client.ss_self ?? 0;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;
  // Only carry spouse data when the filer is actually married. Stops a stale
  // spouse_age from leaking into the year-by-year table after an advisor
  // switches a client back to single/HoH.
  const isMarriedFiler = client.filing_status === 'married_filing_jointly'
    || client.filing_status === 'married_filing_separately';
  const initialSpouseAge = isMarriedFiler ? (client.spouse_age ?? null) : null;
  const ssiColaRate = 0.02;

  // Birth year for RMD calculation (SECURE 2.0: RMD age depends on birth year)
  const currentYear = new Date().getFullYear();
  const birthYear = client.date_of_birth
    ? getBirthYear(client.date_of_birth)
    : currentYear - clientAge;

  // RMD treatment for remaining IRA balance when conversions don't fully deplete
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';

  // Tax payment source: 'from_ira' means the IRA pays its own taxes
  // (conversion is grossed down); 'from_taxable' means taxes are paid externally
  // Conversion-tax funding source. 'from_ira' pays the conversion tax from the
  // IRA (with gross-up). We ALSO fall back to the IRA when the advisor chose
  // 'from_taxable' but the client has NO taxable account ($0) to draw from: for
  // a $0-taxable client "pay from taxable" has no funding source, so the
  // conversion tax was being silently clamped to $0 (the taxableBalance floor),
  // making conversions look tax-free and the tax bracket irrelevant to lifetime
  // wealth (~160 clients affected — overwhelmingly the default from_taxable +
  // $0 taxable). Funding from the IRA is what actually happens — you can't pay a
  // tax bill from a $0 account. The report shows a banner explaining this.
  // Clients WITH a real taxable balance are unchanged.
  const payTaxFromIRA = client.tax_payment_source === 'from_ira'
    || (client.taxable_accounts ?? 0) <= 0;

  // Tax rates
  const maxTaxRate = client.max_tax_rate ?? 24;
  const stateTaxRateDecimal = client.state_tax_rate !== undefined && client.state_tax_rate !== null
    ? client.state_tax_rate / 100
    : getStateTaxRate(client.state);

  // Conversion parameters
  const conversionType = client.conversion_type ?? 'optimized_amount';
  const fixedConversionAmount = client.fixed_conversion_amount ?? 0;
  // Total cap across all years for the 'partial_amount' conversion type.
  // 0 (or null) means "no partial cap" — but the type is only meaningful when > 0,
  // so we treat 0 as effectively no_conversion in that branch below.
  const targetPartialAmount = client.target_partial_amount ?? 0;
  // When true, cap each year's IRA withdrawal for conversion (conversion + tax-from-IRA)
  // at penalty_free_percent × beginning-of-year IRA. Models Allianz/American Equity-style
  // contracts where conversions can't exceed the free-withdrawal allowance without
  // triggering surrender charges. Only applies during the surrender period — after the
  // contract ends, conversions are unconstrained.
  const respectPenaltyFreeLimit = client.respect_penalty_free_limit ?? false;
  const penaltyFreePercent = client.penalty_free_percent ?? 10;
  // 'tax_only' (default, legacy behavior) caps only the tax dollars paid
  // from the IRA. 'all_distributions' is the strict reading: conversion +
  // RMD + tax-from-IRA all count, so the conversion itself must be sized
  // down to keep total outflow under cap.
  const penaltyFreeScope = client.penalty_free_scope ?? 'tax_only';
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;
  const conversionEndAge = client.end_age ?? 100;

  // Cumulative converted across the projection — used by 'partial_amount' to cap
  // total conversions. Outside the loop so it persists across years.
  let cumulativeConverted = 0;

  // Income history for IRMAA 2-year lookback
  const incomeHistory = new Map<number, number>();

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;

    // Primary SSI income (with COLA)
    const primaryYearsCollecting = age >= primarySsStartAge ? age - primarySsStartAge : -1;
    const primarySsIncome = primaryYearsCollecting >= 0
      ? Math.round(primarySsAmount * Math.pow(1 + ssiColaRate, primaryYearsCollecting))
      : 0;

    // Spouse SSI income (with COLA) — MFJ only
    let spouseSsIncome = 0;
    if (client.filing_status === 'married_filing_jointly' && spouseSsAmount > 0) {
      const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : 0;
      const spouseYearsCollecting = currentSpouseAge >= spouseSsStartAge ? currentSpouseAge - spouseSsStartAge : -1;
      spouseSsIncome = spouseYearsCollecting >= 0
        ? Math.round(spouseSsAmount * Math.pow(1 + ssiColaRate, spouseYearsCollecting))
        : 0;
    }

    const ssIncome = primarySsIncome + spouseSsIncome;

    // Other income for bracket calculations (year-specific from income table)
    const otherIncome = getNonSSIIncomeForYear(client, year);
    // Tax-exempt non-SSI income (hoisted so it can be reused by the IRMAA
    // constraint block below without recomputing).
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year);

    // Standard deduction (age-adjusted)
    const currentSpouseAgeForDeduction = initialSpouseAge !== null ? initialSpouseAge + yearOffset : undefined;
    const deductions = getEffectiveDeduction(client.filing_status, age, currentSpouseAgeForDeduction, year, client.additional_deductions);

    // Step 0: Calculate the RMD requirement if the client is old enough and
    // still has a traditional IRA balance. This handles the case where
    // conversions don't fully deplete the IRA before RMD age.
    // SHORT-CIRCUIT: when rmds_handled_externally is true, the modeled bucket
    // is only part of the client's total IRA and RMDs are taken from a separate
    // bucket not modeled here. Skip entirely so RMDs don't eat into the
    // conversion target (e.g., Greg Stopp's Policar case: $1.3M target was
    // landing at $1.17M because RMDs were drawing from the same bucket).
    const rmdRequired = client.rmds_handled_externally
      ? 0
      : Math.min(calculateRMD({ age, traditionalBalance: boyIRA, birthYear }).rmdAmount, boyIRA);

    // Step 0b: Voluntary withdrawals satisfy the RMD up to their amount (IRS
    // rule: any qualifying distribution counts toward that year's RMD; the
    // client doesn't take an RMD on top of a larger voluntary distribution).
    // Resolve voluntary against the FULL IRA balance, then net it against the
    // RMD requirement to derive the actual taxable IRA distribution this year.
    const wd = resolveWithdrawalsForYear(client, year, boyIRA, boyRoth);
    const iraWithdrawal = wd.iraPulled;
    const rothWithdrawal = wd.rothPulled;

    // forcedRmdShortfall: the extra forced distribution needed beyond what
    //   the voluntary already pulled (0 when voluntary covers the RMD).
    // effectiveIraDistribution: total taxable IRA distribution this year,
    //   = max(rmdRequired, iraWithdrawal). NEVER the additive sum.
    // rmdAmount (display field): keeps the legal-requirement meaning — what
    //   the IRS demanded this year — so the year-by-year RMD column stays
    //   informative regardless of whether voluntary covered it.
    const forcedRmdShortfall = Math.max(0, rmdRequired - iraWithdrawal);
    const rmdAmount = rmdRequired;
    const effectiveIraDistribution = iraWithdrawal + forcedRmdShortfall;
    const iraAfterDistribution = boyIRA - effectiveIraDistribution;
    const rothAfterWithdrawal = boyRoth - rothWithdrawal;

    // Existing taxable income (effective IRA distribution + other + taxable
    // SS) — used to seed marginal tax calculations and the SS-aware optimizer.
    const existingNonSSIncome = effectiveIraDistribution + otherIncome;
    const existingTaxInfo = computeTaxableIncomeWithSS({
      otherIncome: existingNonSSIncome,
      ssBenefits: ssIncome,
      taxExemptInterest: taxExemptNonSSI,
      deductions,
      filingStatus: client.filing_status,
    });
    const existingTaxableIncome = existingTaxInfo.taxableIncome;

    // Helper: marginal conversion tax at a given conversion amount.
    // Uses SS-aware delta calculation so the extra tax from newly-taxable
    // SS (tax torpedo) is attributed to the conversion.
    const convTaxAt = (amount: number) =>
      calculateConversionTaxWithSS({
        conversionAmount: amount,
        otherIncome: existingNonSSIncome,
        ssBenefits: ssIncome,
        taxExemptInterest: taxExemptNonSSI,
        deductions,
        filingStatus: client.filing_status,
        taxYear: year,
        state: client.state ?? 'CA',
        stateTaxRateDecimal,
      });

    // Step 1: Handle Roth conversions (on IRA balance AFTER RMD has been taken)
    let conversionAmount = 0;
    let federalTax = 0;
    let stateTax = 0;

    // Carrier penalty-free cap: when respect_penalty_free_limit is true AND the
    // client is still inside the surrender period AND tax is paid from the IRA,
    // the contract limits how much can be DISTRIBUTED out of the policy in any
    // given year. Per advisor feedback (Joshua W., ticket 2b5ff7a4), the cap
    // does NOT restrict the conversion amount — a Roth conversion is an
    // intra-carrier transfer (Trad → Roth at the same carrier) and no money
    // physically leaves the contract. The only thing that trips the
    // penalty-free allowance is dollars actually distributed out of the policy,
    // which only happens when tax is paid from the IRA itself. When tax is
    // paid from outside funds, no cap applies.
    //
    // The cap therefore restricts taxesPaidFromIRA, not the conversion
    // ceiling. Any tax overflow above the cap is modeled as paid from external
    // funds (taxesPaidExternally on the YearlyResult). The conversion sizing
    // branches below run against the FULL physical IRA (iraAfterDistribution)
    // — the split happens after the conversion is sized.
    const inSurrenderPeriod = yearOffset < surrenderYears;
    // Tax cap (used in 'tax_only' scope): only the tax dollars from the IRA
    // count against the carrier's penalty-free allowance. Conversion runs
    // off the full physical IRA below.
    const taxCap = (respectPenaltyFreeLimit && inSurrenderPeriod && payTaxFromIRA)
      ? Math.round(boyIRA * penaltyFreePercent / 100)
      : Number.POSITIVE_INFINITY;
    // Outflow cap (used in 'all_distributions' scope): conversion +
    // effective IRA distribution + tax-from-IRA must all fit under the
    // allowance. The effective IRA distribution (= max(rmdRequired,
    // iraWithdrawal)) has already left the IRA before we got here, so it
    // comes off the cap first. Whatever's left is the room available for
    // the conversion (and any tax-from-IRA on it). We apply the cap even
    // when tax is paid externally — the conversion itself still physically
    // leaves the qualified IRA under the strict reading.
    const useOutflowCap =
      respectPenaltyFreeLimit &&
      inSurrenderPeriod &&
      penaltyFreeScope === 'all_distributions';
    const outflowCap = useOutflowCap
      ? Math.round(boyIRA * penaltyFreePercent / 100)
      : Number.POSITIVE_INFINITY;
    // Conversion ceiling under the strict interpretation. Subtracts the
    // effective IRA distribution (whichever of forced RMD or voluntary is
    // larger) that already left the IRA. Can be negative if the distribution
    // alone exceeds the cap; in that case conversion = 0.
    const conversionRoomUnderOutflowCap = useOutflowCap
      ? Math.max(0, outflowCap - effectiveIraDistribution)
      : Number.POSITIVE_INFINITY;
    const effectiveIraForConversion = Math.min(
      iraAfterDistribution,
      conversionRoomUnderOutflowCap,
    );

    const shouldConvert = conversionType !== 'no_conversion' &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          effectiveIraForConversion > 100; // Skip dust balances

    // Flag: when we've already solved the from-IRA tax math exactly (e.g. for
    // full_conversion), skip the generic gross-down below to avoid shrinking
    // the conversion twice.
    let skipGrossDown = false;

    if (shouldConvert) {
      // Determine conversion amount based on type
      if (conversionType === 'full_conversion') {
        if (payTaxFromIRA) {
          // Special case: "empty the IRA" when taxes are paid from the IRA.
          // Two regimes depending on whether the carrier tax-cap binds:
          //   - Regime A (cap not binding, or cap = ∞): conv + tax(conv) =
          //     iraAfterDistribution. Iterative solver. Tax is fully internal.
          //   - Regime B (cap binding): conv = iraAfterDistribution - taxCap.
          //     The IRA distributes exactly (conv + taxCap) =
          //     iraAfterDistribution (still "empties" the IRA in carrier
          //     terms), and the tax overflow (tax(conv) − taxCap) is funded
          //     externally. Conversion stays as large as physically possible;
          //     only the tax dollars trip the cap.
          // Detection: try Regime B first. If tax(iraAfterDistribution −
          // taxCap) > taxCap, we're genuinely cap-bound. Otherwise fall
          // through to Regime A.
          let useRegimeB = false;
          // Regime B (tax overflow → external) only applies in the legacy
          // 'tax_only' scope. In 'all_distributions' mode there is no
          // overflow concept — the conversion itself has already been
          // bounded above (effectiveIraForConversion = min(iraAfterDistribution,
          // outflowCap - effectiveIraDistribution)), so Regime A's solver
          // handles it cleanly.
          if (taxCap !== Number.POSITIVE_INFINITY && !useOutflowCap) {
            const tryConv = Math.max(0, effectiveIraForConversion - taxCap);
            const tryTaxes = convTaxAt(tryConv);
            if (tryTaxes.federalTax + tryTaxes.stateTax > taxCap) {
              conversionAmount = tryConv;
              useRegimeB = true;
            }
          }
          if (!useRegimeB) {
            // Regime A — today's empty-the-IRA solver. Converges in 2-3
            // iterations against the SS-aware marginal tax calc.
            let solved = effectiveIraForConversion * (1 - (maxTaxRate / 100 + stateTaxRateDecimal));
            for (let i = 0; i < 5; i++) {
              const { federalTax: fTax, stateTax: sTax } = convTaxAt(solved);
              solved = effectiveIraForConversion - fTax - sTax;
            }
            conversionAmount = Math.max(0, Math.round(solved));
            const { federalTax: fcVerifyF, stateTax: fcVerifyS } = convTaxAt(conversionAmount);
            const fcResidual = effectiveIraForConversion - conversionAmount - fcVerifyF - fcVerifyS;
            if (fcResidual > 0 && fcResidual < 50000) {
              conversionAmount += fcResidual;
            }
          }
          skipGrossDown = true;
        } else {
          conversionAmount = effectiveIraForConversion;
        }
      } else if (conversionType === 'fixed_amount' && fixedConversionAmount > 0) {
        // Fixed amount: convert specified amount per year (or remaining balance if less).
        if (payTaxFromIRA) {
          const estEffRate = maxTaxRate / 100 + stateTaxRateDecimal;
          const maxConvWithTax = Math.floor(effectiveIraForConversion / (1 + estEffRate));
          if (maxConvWithTax < fixedConversionAmount) {
            let solved = effectiveIraForConversion * (1 - estEffRate);
            for (let i = 0; i < 5; i++) {
              const { federalTax: fTax, stateTax: sTax } = convTaxAt(solved);
              solved = effectiveIraForConversion - fTax - sTax;
            }
            conversionAmount = Math.max(0, Math.round(solved));
            const { federalTax: verifyFTax, stateTax: verifySTax } = convTaxAt(conversionAmount);
            const residual = effectiveIraForConversion - conversionAmount - verifyFTax - verifySTax;
            if (residual > 0 && residual < 50000) {
              conversionAmount += residual;
            }
          } else {
            conversionAmount = fixedConversionAmount;
          }
          skipGrossDown = true;
        } else {
          conversionAmount = Math.min(fixedConversionAmount, effectiveIraForConversion);
        }
      } else if (conversionType === 'optimized_amount' || conversionType === 'partial_amount') {
        // optimized_amount: fill up to target bracket ceiling with SS taxation
        // correctly accounted for (tax torpedo).
        // partial_amount: same as optimized, but cap the per-year conversion so
        // cumulative across all years doesn't exceed targetPartialAmount.

        // For partial_amount, compute the remaining headroom against the cap.
        // Once we've converted the full target, no more conversions happen.
        const partialRemaining = conversionType === 'partial_amount'
          ? Math.max(0, targetPartialAmount - cumulativeConverted)
          : Number.POSITIVE_INFINITY;

        // Cap the iraBalance fed into the planner by the remaining cap AND the
        // carrier penalty-free cap. The planner returns the bracket-optimal amount
        // within whatever balance we hand it, so capping the input is sufficient.
        const cappedIra = Math.min(effectiveIraForConversion, partialRemaining);

        if (cappedIra <= 0) {
          // Cap exhausted — no conversion this year
          conversionAmount = 0;
          federalTax = 0;
          stateTax = 0;
          skipGrossDown = true;
        } else if (payTaxFromIRA) {
          // Plan the full IRA withdrawal (conversion + tax) as a single
          // bracket-filling distribution. The planner's "total withdrawal"
          // is what the IRS sees on the 1099-R; splitting into conversion
          // and tax_from_IRA happens after the bracket check, so both are
          // correctly below the ceiling. This is the self-consistent
          // replacement for the legacy `conversion × (1 − rate)` haircut.
          const plan = calculateSSAwareIRAWithdrawalPlan({
            iraBalance: cappedIra,
            otherIncome: existingNonSSIncome,
            ssBenefits: ssIncome,
            taxExemptInterest: taxExemptNonSSI,
            deductions,
            maxBracketRate: maxTaxRate,
            filingStatus: client.filing_status,
            taxYear: year,
            state: client.state ?? 'CA',
            stateTaxRateDecimal,
          });
          conversionAmount = plan.conversion;
          federalTax = plan.federalTaxFromIRA;
          stateTax = plan.stateTaxFromIRA;
          skipGrossDown = true;
        } else {
          conversionAmount = calculateSSAwareOptimalConversion({
            iraBalance: cappedIra,
            otherIncome: existingNonSSIncome,
            ssBenefits: ssIncome,
            taxExemptInterest: taxExemptNonSSI,
            deductions,
            maxBracketRate: maxTaxRate,
            filingStatus: client.filing_status,
            taxYear: year,
          });
        }
      }

      // IRMAA threshold constraint (applies to ALL conversion methods as a
      // global ceiling). When enabled AND client is 63+, cap conversion so
      // MAGI doesn't push into a higher IRMAA tier. IRMAA uses a 2-year
      // lookback and kicks in at 65, so conversions at 63+ are the ones that
      // matter. Before 63, no IRMAA constraint.
      if (client.constraint_type === 'irmaa_threshold' && age >= 63 && conversionAmount > 0) {
        // All values here are in CENTS (engine operates in cents throughout).
        // Pre-conversion MAGI = baseline taxable + tax-exempt + SSI (no conversion yet).
        // Effective IRA distribution covers both forced RMD and voluntary
        // (whichever is larger) without double-counting them.
        const preConversionGrossTaxable = effectiveIraDistribution + otherIncome;
        const preConversionMagi =
          calculateMAGI(preConversionGrossTaxable, taxExemptNonSSI) +
          primarySsIncome + spouseSsIncome;

        // Two-stage headroom calculation:
        //
        //   1. Try the advisor's selected target tier (0 = Standard, 5 = Tier 5).
        //      Returns positive headroom when achievable, Infinity for Tier 5
        //      (no cap), or negative when MAGI is already past the target tier.
        //
        //   2. If the target is infeasible (negative headroom), auto-clamp to
        //      "current tier" semantics — fall back to calculateIRMAAHeadroom
        //      which returns the distance to the next tier from current MAGI.
        //      This is the "don't make it worse" interpretation: the advisor
        //      asked the impossible, so the engine still constrains conversions
        //      from pushing MAGI even higher than they already are. A dashboard
        //      warning surfaces this auto-clamp so the advisor knows it happened.
        //
        // Pre-2026-06-05 behavior used calculateIRMAAHeadroom only — the same
        // "stay in your current tier" fallback applied in every case, with no
        // way for the advisor to pick a higher target. The new target-tier
        // selector + this two-stage logic preserves the old behavior whenever
        // the target is infeasible AND gives the advisor agency when it isn't.
        // target_irmaa_tier is a string enum ("standard" | "tier_1" | ... |
        // "tier_5") that maps to the numeric tier index 0-5. Default to
        // "standard" (the most conservative — matches old engine behavior for
        // clients who were sitting in Standard, which was the vast majority).
        const targetTierStr = client.target_irmaa_tier ?? 'standard';
        const targetTier = (
          { standard: 0, tier_1: 1, tier_2: 2, tier_3: 3, tier_4: 4, tier_5: 5 } as const
        )[targetTierStr] ?? 0;
        const targetHeadroom = calculateIRMAAHeadroomToTarget(
          preConversionMagi,
          client.filing_status,
          targetTier,
          year,
        );
        let irmaaHeadroom: number;
        if (!Number.isFinite(targetHeadroom)) {
          // Target Tier 5 — no IRMAA cap.
          irmaaHeadroom = Infinity;
        } else if (targetHeadroom > 0) {
          // Target is achievable this year.
          irmaaHeadroom = targetHeadroom;
        } else {
          // Target is infeasible — auto-clamp to client's actual current
          // tier so conversions don't push MAGI higher than necessary.
          irmaaHeadroom = calculateIRMAAHeadroom(
            preConversionMagi,
            client.filing_status,
            year,
          );
        }

        // If headroom is Infinity (target Tier 5 or client past top tier),
        // further conversions don't increase IRMAA — skip cap. If headroom
        // is zero or negative even after auto-clamp (which can happen when
        // current MAGI is exactly on a tier boundary), also skip cap.
        if (Number.isFinite(irmaaHeadroom) && irmaaHeadroom > 0) {
          // Leave 1-cent buffer since IRMAA uses cliff thresholds.
          const irmaaCap = Math.max(0, irmaaHeadroom - 1);

          // For internal tax + optimized_amount: MAGI is increased by the FULL
          // IRA withdrawal (conversion + tax withheld), not just the conversion.
          // The headroom therefore bounds the TOTAL withdrawal, not the
          // conversion alone. If the planner's total withdrawal exceeds the
          // IRMAA cap, re-plan with the IRMAA cap as the effective IRA ceiling
          // — this lets the planner find a self-consistent (conv, tax) split
          // that respects both the bracket ceiling AND the IRMAA tier.
          //
          // For all other paths (external tax, or internal with full/fixed
          // conversion types), the subsequent tax recompute block rebuilds
          // fed/state tax against the capped conversion, so just capping
          // conversionAmount directly stays self-consistent.
          const usesPlan = payTaxFromIRA && skipGrossDown && (conversionType === 'optimized_amount' || conversionType === 'partial_amount');
          if (usesPlan) {
            const currentTotal = conversionAmount + federalTax + stateTax;
            if (currentTotal > irmaaCap) {
              // Also respect the partial cap if active
              const partialRemainingForIrmaa = conversionType === 'partial_amount'
                ? Math.max(0, targetPartialAmount - cumulativeConverted)
                : Number.POSITIVE_INFINITY;
              const cappedPlan = calculateSSAwareIRAWithdrawalPlan({
                iraBalance: Math.min(effectiveIraForConversion, irmaaCap, partialRemainingForIrmaa),
                otherIncome: existingNonSSIncome,
                ssBenefits: ssIncome,
                taxExemptInterest: taxExemptNonSSI,
                deductions,
                maxBracketRate: maxTaxRate,
                filingStatus: client.filing_status,
                taxYear: year,
                state: client.state ?? 'CA',
                stateTaxRateDecimal,
              });
              conversionAmount = cappedPlan.conversion;
              federalTax = cappedPlan.federalTaxFromIRA;
              stateTax = cappedPlan.stateTaxFromIRA;
            }
          } else {
            conversionAmount = Math.min(conversionAmount, irmaaCap);
          }
        }
      }

      // Carrier penalty-free TAX cap (tax_only scope, tax paid from the IRA).
      // The tax dollars pulled from the IRA must fit within the penalty-free
      // allowance (taxCap = penalty_free_percent × BOY IRA). The legacy behavior
      // kept the full bracket-filling conversion and routed the tax overflow to
      // EXTERNAL funds — but a `from_ira` client has no external funds, so that
      // silently broke the "limit conversion so tax ≤ 10%" intent and showed a
      // huge external tax payment the client never makes (Joshua Williamson,
      // re: Jim Nelson). Fix: size the conversion DOWN until its IRA tax fits the
      // cap, keeping everything inside the IRA (no external overflow). Mirrors the
      // IRMAA re-plan above — re-plan with a reduced balance so the (conversion,
      // tax) split stays self-consistent (gross-up preserved). Only the
      // optimized/partial planner path needs this; full/fixed already solve the
      // conversion-vs-tax split against the cap above.
      const usesPlanForTaxCap = payTaxFromIRA && skipGrossDown &&
        (conversionType === 'optimized_amount' || conversionType === 'partial_amount');
      if (usesPlanForTaxCap && taxCap !== Number.POSITIVE_INFINITY && !useOutflowCap
          && conversionAmount > 0 && federalTax + stateTax > taxCap) {
        // Binary-search the largest input balance whose planned IRA tax ≤ taxCap.
        // Upper bound = current total withdrawal (conv + tax), which produced a
        // tax above the cap; lower bound 0. ~40 iterations → sub-dollar precision.
        let lo = 0;
        let hi = conversionAmount + federalTax + stateTax;
        let bestConv = 0, bestFed = 0, bestState = 0;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          const p = calculateSSAwareIRAWithdrawalPlan({
            iraBalance: mid,
            otherIncome: existingNonSSIncome,
            ssBenefits: ssIncome,
            taxExemptInterest: taxExemptNonSSI,
            deductions,
            maxBracketRate: maxTaxRate,
            filingStatus: client.filing_status,
            taxYear: year,
            state: client.state ?? 'CA',
            stateTaxRateDecimal,
          });
          if (p.federalTaxFromIRA + p.stateTaxFromIRA <= taxCap) {
            bestConv = p.conversion;
            bestFed = p.federalTaxFromIRA;
            bestState = p.stateTaxFromIRA;
            lo = mid;
          } else {
            hi = mid;
          }
        }
        conversionAmount = bestConv;
        federalTax = bestFed;
        stateTax = bestState;
      }

      // Same penalty-free TAX cap for the non-planner conversion types
      // (fixed_amount, full_conversion). When the cap binds and tax is paid
      // from the IRA, size the conversion DOWN so its IRA tax fits the
      // allowance — rather than keeping the user-pinned / full conversion and
      // routing the tax overflow to external funds a from_ira client doesn't
      // have. The respect_penalty_free_limit checkbox is a hard "limit the
      // conversion" constraint that applies to EVERY conversion type. Tax here
      // is recomputed below via convTaxAt (planAlreadySetTax is false for these
      // types), so we only need to shrink conversionAmount. (Joshua Williamson
      // follow-up — full_conversion now spreads across years when the cap binds
      // instead of emptying the IRA in one over-cap year.)
      if (payTaxFromIRA && conversionAmount > 0 && taxCap !== Number.POSITIVE_INFINITY && !useOutflowCap
          && (conversionType === 'fixed_amount' || conversionType === 'full_conversion')) {
        const capTax0 = convTaxAt(conversionAmount);
        if (capTax0.federalTax + capTax0.stateTax > taxCap) {
          let lo = 0, hi = conversionAmount;
          for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            const t = convTaxAt(mid);
            if (t.federalTax + t.stateTax <= taxCap) lo = mid; else hi = mid;
          }
          conversionAmount = Math.floor(lo);
        }
      }

      // Handle tax payment from IRA (gross-down)
      // When taxes are paid from IRA, the total IRA withdrawal is (conversion + tax).
      // To keep the total withdrawal within the target amount, reduce the portion
      // that actually converts to Roth so there's room for the tax to be paid from the IRA.
      // Skip when full_conversion / fixed_amount / optimized_amount already solved
      // the conversion-vs-tax split exactly above (skipGrossDown=true).
      if (payTaxFromIRA && conversionAmount > 0 && !skipGrossDown) {
        const effectiveRate = maxTaxRate / 100 + stateTaxRateDecimal;
        conversionAmount = Math.round(conversionAmount * (1 - effectiveRate));
        conversionAmount = Math.min(conversionAmount, effectiveIraForConversion);
      }

      // Calculate marginal taxes on conversion (SS-aware delta). Skip when the
      // planner already produced authoritative tax numbers — in that path, the
      // tax is computed against the full (conversion + tax-from-IRA) distribution,
      // which is what the IRS actually sees. Re-running convTaxAt(conversion)
      // here would overwrite it with tax-on-conversion-alone, re-introducing
      // the very bug the planner was added to fix.
      const planAlreadySetTax = payTaxFromIRA && skipGrossDown && (conversionType === 'optimized_amount' || conversionType === 'partial_amount');
      if (conversionAmount > 0 && !planAlreadySetTax) {
        const convTax = convTaxAt(conversionAmount);
        federalTax = convTax.federalTax;
        stateTax = convTax.stateTax;
      }
    }

    // Execute conversion (on IRA balance already reduced by RMD + voluntary withdrawal).
    // When payTaxFromIRA, the IRA pays the conversion tax — but only up to
    // the carrier tax cap (when the cap is active). Anything above the cap is
    // assumed paid from external funds and tracked as taxesPaidExternally
    // for downstream display. When the cap is ∞ (toggle off, or surrender
    // period over, or tax_payment_source = from_outside), the full tax goes
    // to either the IRA or to the implicit external bucket as before.
    const conversionTaxBeforeSplit = federalTax + stateTax;
    // Split tax between IRA and external. In 'tax_only' scope (legacy),
    // tax above the taxCap is funded externally. In 'all_distributions'
    // scope, the conversion was already sized so conv + tax fits under
    // the outflowCap — no overflow, no external bucket.
    const conversionTaxFromIRA = payTaxFromIRA
      ? (useOutflowCap
          ? conversionTaxBeforeSplit
          : Math.min(taxCap, conversionTaxBeforeSplit))
      : 0;
    const conversionTaxExternal = payTaxFromIRA
      ? Math.max(0, conversionTaxBeforeSplit - conversionTaxFromIRA)
      : 0;
    // Floor at 0: a traditional IRA balance can never go negative. In the
    // depletion year, the fixed_amount/full_conversion tax solvers can size
    // conversion + tax-from-IRA a few dollars above the remaining balance (an
    // iterative-solver rounding residual). Without this floor that tiny excess
    // makes iraAfterConversion negative, then line ~664 grows it by interest and
    // it compounds into a visibly negative "traditional IRA" in later years.
    // (Kwanza E. ticket: negative traditional IRA on a fixed-amount, tax-from-IRA
    // scenario.) Single choke point — covers every conversion type.
    const iraAfterConversion = Math.max(0, iraAfterDistribution - conversionAmount - conversionTaxFromIRA);
    const rothAfterConversion = rothAfterWithdrawal + conversionAmount;

    // Track cumulative withdrawals for the principal protection floor.
    // Effective IRA distribution already represents the total IRA pull
    // (max of RMD and voluntary, never the sum); the conversion + tax also
    // leave the contract.
    cumulativeWithdrawn += effectiveIraDistribution + conversionAmount + conversionTaxFromIRA;
    // Track cumulative converted (used by 'partial_amount' to enforce the total cap)
    cumulativeConverted += conversionAmount;

    // Step 2: Calculate interest AFTER conversion.
    // IRA (annuity) uses contract rate during the surrender period and the
    // post-contract (renewal) rate afterward. When there's no surrender period
    // configured, the contract rate applies forever (can't switch to renewal
    // if there's no contract to expire).
    // Roth is not part of the annuity — once converted, money lives in a
    // standard Roth IRA and should always grow at the main `rate_of_return`,
    // regardless of where the annuity is in its lifecycle.
    const iraGrowthRate = surrenderYears === 0 || yearOffset < surrenderYears
      ? contractRate
      : postContractRate;
    const iraInterest = Math.round(iraAfterConversion * iraGrowthRate);
    const rothGrowthRate = (client.rate_of_return ?? 7) / 100;
    const rothInterest = Math.round(rothAfterConversion * rothGrowthRate);

    // Update balances
    iraBalance = iraAfterConversion + iraInterest;
    rothBalance = rothAfterConversion + rothInterest;

    // Step 2.5: Apply annual rider fee (only during surrender period, applied to IRA balance)
    // Rider fees are charged on the annuity (IRA) — Roth side has already been moved out
    let yearRiderFee = 0;
    if (riderFeePercent > 0 && yearOffset < surrenderYears) {
      yearRiderFee = Math.round(iraBalance * riderFeePercent);
      iraBalance = iraBalance - yearRiderFee;
    }

    // Step 3: Apply anniversary bonus to IRA (annuity AV) if within bonus years
    // yearOffset is 0-indexed: yearOffset 0 = first year of policy
    // Anniversary bonuses apply at end of years 1, 2, 3 (yearOffset 0, 1, 2)
    if (anniversaryBonusPercent > 0 && yearOffset < anniversaryBonusYears) {
      const anniversaryBonusAmount = Math.round(iraBalance * anniversaryBonusPercent);
      iraBalance = iraBalance + anniversaryBonusAmount;
    }

    // Step 3.5: Principal protection floor (FIA guarantee).
    // The AV cannot fall below the initial premium minus any withdrawals taken.
    // Applies for the life of the contract. We model this as the entire
    // projection for simplicity — in practice the floor rarely binds because
    // FIAs credit 0% on down years, but it protects against rider fees eating
    // principal. Without this, a config with surrender_years=0 would silently
    // skip the guarantee entirely.
    if (protectInitialPremium) {
      const protectedFloor = Math.max(0, initialPremium - cumulativeWithdrawn);
      if (iraBalance < protectedFloor) {
        iraBalance = protectedFloor;
      }
    }

    // Step 4: Calculate surrender value on IRA (annuity AV)
    let surrenderChargePercent: number | undefined;
    let surrenderValue: number | undefined;
    if (surrenderSchedule && surrenderSchedule.length > 0) {
      surrenderChargePercent = yearOffset < surrenderSchedule.length
        ? surrenderSchedule[yearOffset]
        : 0; // No charge after surrender period
      surrenderValue = Math.round(iraBalance * (1 - surrenderChargePercent / 100));
    }

    // Tax calculation details with proper SS taxation. When tax_payment_source
    // is 'from_ira', the tax withheld from the IRA is ALSO a taxable
    // distribution (same 1099-R), so we must include it in the year's gross
    // taxable income — otherwise federal tax, state tax, MAGI/IRMAA, and the
    // bracket display would all be understated by the tax-on-tax amount. With
    // the planner-driven bracket fill above, this addition exactly squares
    // the books: the displayed taxable income matches what the IRS computes.
    const grossNonSSIncome = conversionAmount + conversionTaxFromIRA + effectiveIraDistribution + otherIncome;
    const finalTaxInfo = computeTaxableIncomeWithSS({
      otherIncome: grossNonSSIncome,
      ssBenefits: ssIncome,
      taxExemptInterest: taxExemptNonSSI,
      deductions,
      filingStatus: client.filing_status,
    });
    const totalIncome = grossNonSSIncome + ssIncome; // For display only
    const agi = finalTaxInfo.agi;
    // MAGI for IRMAA: AGI + tax-exempt + non-taxable SS (= AGI + tax-exempt + fullSS
    // when measured against gross SS, matching historical behavior).
    const magi = calculateMAGI(grossNonSSIncome, taxExemptNonSSI) + ssIncome;
    const standardDeduction = deductions;
    const taxableIncomeForTax = finalTaxInfo.taxableIncome;
    // Pass year so the bracket lookup uses the right inflation-adjusted thresholds.
    // Without year, the function defaults to 2026 — which made the year-by-year
    // display show much higher marginal brackets than the actual conversion math
    // was using (the conversion engine itself uses inflation-adjusted brackets).
    const federalTaxBracket = getMarginalBracket(taxableIncomeForTax, client.filing_status, year);

    // Full federal/state tax on the year's total taxable income.
    const totalFederalTax = calculateFederalTax({
      taxableIncome: taxableIncomeForTax,
      filingStatus: client.filing_status,
      taxYear: year,
    }).totalTax;
    const totalStateTax = calculateStateTax({
      taxableIncome: taxableIncomeForTax,
      state: client.state ?? 'CA',
      filingStatus: client.filing_status,
      overrideRate: stateTaxRateDecimal,
    }).totalTax;

    // Preserve marginal conversion-tax attribution (captured above when
    // conversionAmount > 0) for display columns, then override the year's
    // full federal/state tax.
    const conversionFederalTax = federalTax;
    const conversionStateTax = stateTax;
    federalTax = totalFederalTax;
    stateTax = totalStateTax;

    // Marginal federal tax on the FULL year's IRA distribution.
    // = Tax(year with IRA distribution) − Tax(year without IRA distribution).
    // Captures the conversion-marginal tax PLUS the tax owed on the gross-up
    // dollars (which the existing federalTaxOnConversions excludes — it
    // only attributes the conversion-amount slice). Surfaced as a single
    // "Total Fed Tax on IRA Withdrawal" column so an advisor can show a
    // client the real tax-cost number for pulling X dollars out of the
    // IRA, without summing two display columns. (Robert R. ticket a1639792.)
    let federalTaxOnIRAWithdrawal = 0;
    const hasIraDistribution = conversionAmount + conversionTaxFromIRA + effectiveIraDistribution > 0;
    if (hasIraDistribution) {
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
      federalTaxOnIRAWithdrawal = Math.max(0, totalFederalTax - noIraFederalTax);
    }

    // Store MAGI for IRMAA 2-year lookback
    incomeHistory.set(year, magi);

    // IRMAA (Medicare surcharge, age 65+ only, uses 2-year lookback).
    // Tier is captured from the SAME lookback as the surcharge so the
    // year-by-year "IRMAA Tier" column matches the "IRMAA Amount" column
    // on the same row. Previously the tier was recomputed from current-
    // year MAGI, producing rows like "Tier 4 / $0" in early projection
    // years or "Standard / $9,240" when a conversion year aged out of
    // the lookback window.
    let irmaaSurcharge = 0;
    let irmaaTier = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
      irmaaTier = irmaaResult.tier;
    }

    // 10% early withdrawal penalty. Two distinct triggers, each on its own:
    //   1. tax paid from the IRA when under 59.5 — the conversion itself is
    //      penalty-exempt (IRC §72(t)(2)(A)(vi)), but the extra withdrawal to
    //      cover taxes IS a taxable distribution subject to the 10%.
    //   2. voluntary IRA withdrawal scheduled by the advisor when under 59.5.
    // We use age < 60 as a proxy for "under 59.5" since we track integer ages.
    const conversionTaxPenalty =
      conversionTaxFromIRA > 0 && age < 60
        ? Math.round(conversionTaxFromIRA * 0.10)
        : 0;
    const voluntaryWithdrawalPenalty = earlyWithdrawalPenaltyOnIRA(age, iraWithdrawal);
    const earlyWithdrawalPenalty = conversionTaxPenalty + voluntaryWithdrawalPenalty;

    // Taxes paid from external funds (may reduce taxable balance — see below)
    const totalTax = federalTax + stateTax + irmaaSurcharge + earlyWithdrawalPenalty;

    // ---- Symmetric tax accounting between baseline and strategy ----
    // The taxable account previously absorbed every tax line in the strategy
    // (wage tax, SS tax, RMD tax) but the BASELINE engine only does that in
    // 'cash'/'reinvested' modes — in 'spent' mode the baseline keeps taxable
    // flat (baseline.ts:217). That asymmetry punished any 'spent'-mode client
    // who had real wages or other taxable income before/during their
    // conversion phase: the same wage tax got modeled on the strategy side
    // but ignored on the baseline side, dragging Lifetime Wealth After down
    // by tens to hundreds of thousands of dollars.
    //
    // Fix: in 'spent' mode, only deduct CONVERSION-related tax that's
    // genuinely paid from external/taxable funds (i.e. when payTaxFromIRA is
    // false). Non-conversion tax (wages, SS, RMD) is paid from the income
    // that generated it and exists identically in both scenarios — modeling
    // it on one side only is wrong. In 'cash'/'reinvested' modes, baseline
    // also deducts the full totalTax (lines 220/223 of baseline.ts) so we
    // keep the legacy behavior there to stay symmetric on both sides.
    // Only tax genuinely funded FROM the taxable brokerage reduces it:
    //   • conversion tax paid from external/taxable funds (payTaxFromIRA=false);
    //     conversion tax paid from the IRA never touches the brokerage.
    //   • the forced RMD's OWN attributable tax — netted out before it lands.
    // Tax on every OTHER income line (SS, wages, non-SSI) is funded by that
    // income itself, NOT the brokerage. This matches baseline.ts's option-B
    // fix so reinvested RMDs accumulate identically on both sides. Previously
    // this branch deducted the FULL totalTax (incl. SS/other-income tax),
    // understating the strategy's taxable account vs the baseline for
    // partial-conversion clients in reinvested mode (ticket 2a95f2e9 follow-up).
    const conversionFedStateTax = conversionFederalTax + conversionStateTax;
    const externalConversionTax = payTaxFromIRA ? 0 : conversionFedStateTax;
    // Forced-RMD attributable tax — identical method/basis to baseline.ts: the
    // forced RMD's share of the NO-conversion ordinary tax. fed/state are
    // computed on existingTaxableIncome (RMD + voluntary + SS + other, NO
    // conversion dollars), plus IRMAA — exactly what baseline pro-rates. The
    // early-withdrawal penalty is omitted (always $0 in RMD years, age ≥ 73).
    const noConvFedStateTax = forcedRmdShortfall > 0
      ? calculateFederalTax({ taxableIncome: existingTaxableIncome, filingStatus: client.filing_status, taxYear: year }).totalTax
        + calculateStateTax({ taxableIncome: existingTaxableIncome, state: client.state ?? 'CA', filingStatus: client.filing_status, overrideRate: stateTaxRateDecimal }).totalTax
      : 0;
    const grossOrdinaryIncome = effectiveIraDistribution + otherIncome;
    const rmdShareOfOrdinary = grossOrdinaryIncome > 0 ? forcedRmdShortfall / grossOrdinaryIncome : 0;
    const rmdAttributableTax = Math.round((noConvFedStateTax + irmaaSurcharge) * rmdShareOfOrdinary);
    const afterTaxForcedRmd = forcedRmdShortfall - rmdAttributableTax;
    // The reinvested-RMD brokerage is a SIDE taxable account (not the FIA), so
    // it grows at the same market/comparison rate the baseline uses for its
    // taxable account — never the FIA contract rate. Cash mode: no growth.
    // Clamp at $0 (Jorge V., ticket 809a5774) remains only as a defensive
    // floor and should virtually never bind now. Only the FORCED RMD shortfall
    // flows in — the voluntary IRA portion is presumed spent, matching the
    // voluntary-withdrawal semantics elsewhere in the engine.
    const taxableBrokerageRate = (client.baseline_comparison_rate ?? client.growth_rate ?? 7) / 100;
    const taxableInterest = rmdTreatment === 'reinvested' ? Math.round(boyTaxable * taxableBrokerageRate) : 0;
    // Tax-credit savings are retained as cash in the taxable bucket: the dollars
    // the client did NOT send to the IRS this year stay with them. (Modeling
    // simplification: they land in taxable even when the tax would've been paid
    // from the IRA — net worth is correct to the dollar; only the bucket/growth
    // treatment is approximate.)
    const desiredTaxableBalance = rmdTreatment === 'spent'
      ? boyTaxable - externalConversionTax
      : boyTaxable + afterTaxForcedRmd + taxableInterest - externalConversionTax;
    taxableBalance = Math.max(0, desiredTaxableBalance);

    // Product bonus applied this year. Two sources:
    //  1. Upfront premium bonus (year 0 only) — bonus_percent × initial deposit.
    //     Already baked into the starting iraBalance above (initialValue × (1 + bonus_percent)),
    //     but we surface it here so the year-by-year "Product Bonus" column shows
    //     the bonus the carrier actually credited in year 0. Without this, products
    //     with a one-time premium bonus (e.g., Vesting Bonus Growth, 14% upfront)
    //     showed $0 in every year of the table even though the bonus was applied,
    //     making advisors think the bonus wasn't being honored.
    //  2. Anniversary bonus (years 1..anniversaryBonusYears) — applied to the
    //     post-conversion + post-interest IRA balance per the contract.
    const upfrontBonusThisYear = yearOffset === 0
      ? Math.round(initialValue * bonusPercent / 100)
      : 0;
    const anniversaryBonusThisYear = anniversaryBonusPercent > 0 && yearOffset < anniversaryBonusYears
      ? Math.round((iraAfterConversion + iraInterest) * anniversaryBonusPercent)
      : 0;
    const productBonusApplied = upfrontBonusThisYear + anniversaryBonusThisYear;

    // Calculate display growth/interest for each account.
    // traditionalGrowth excludes the upfront premium bonus — that bonus is
    // applied at issue (it's already in the starting iraBalance), not earned
    // as growth during year 0. It's surfaced in productBonusApplied for the
    // bonus column. Only anniversary bonuses count as in-year growth credits.
    const traditionalGrowth = iraInterest + anniversaryBonusThisYear;
    const rothGrowth = rothInterest;
    const taxableGrowth = taxableInterest; // interest on the reinvested-RMD side brokerage ('reinvested' mode); 0 for cash/spent

    // Tax component breakdown. Marginal conversion tax was computed above
    // (conversionFederalTax / conversionStateTax). The remainder is split
    // between ordinary (RMD + other) and the taxable-SS portion.
    const federalTaxOnConversions = conversionFederalTax;
    const stateTaxOnConversions = conversionStateTax;
    const residualFederalTax = Math.max(0, federalTax - federalTaxOnConversions);
    const residualStateTax = Math.max(0, stateTax - stateTaxOnConversions);
    const ordinaryBaseline = effectiveIraDistribution + otherIncome;
    const ssTaxableBaseline = finalTaxInfo.taxableSS;
    const residualDenominator = ordinaryBaseline + ssTaxableBaseline;
    const federalTaxOnSS = residualDenominator > 0 && ssTaxableBaseline > 0
      ? Math.round(residualFederalTax * ssTaxableBaseline / residualDenominator)
      : 0;
    const federalTaxOnOrdinaryIncome = residualFederalTax - federalTaxOnSS;
    const stateTaxOnSS = residualDenominator > 0 && ssTaxableBaseline > 0
      ? Math.round(residualStateTax * ssTaxableBaseline / residualDenominator)
      : 0;
    const stateTaxOnOrdinaryIncome = residualStateTax - stateTaxOnSS;

    const currentSpouseAge = initialSpouseAge !== null ? initialSpouseAge + yearOffset : null;

    results.push({
      year,
      age,
      spouseAge: currentSpouseAge,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount,
      conversionAmount,
      ssIncome,
      pensionIncome: 0,
      otherIncome,
      totalIncome,
      federalTax,
      stateTax,
      niitTax: 0,
      irmaaSurcharge,
      totalTax,
      taxableSS: finalTaxInfo.taxableSS,
      netWorth: iraBalance + rothBalance + taxableBalance,
      surrenderChargePercent,
      surrenderValue,
      // Extended fields for adjustable columns
      traditionalBOY: boyIRA,
      rothBOY: boyRoth,
      taxableBOY: boyTaxable,
      traditionalGrowth,
      rothGrowth,
      taxableGrowth,
      productBonusApplied,
      magi,
      agi,
      standardDeduction,
      taxableIncome: taxableIncomeForTax,
      federalTaxBracket,
      irmaaTier,
      federalTaxOnSS,
      federalTaxOnConversions,
      federalTaxOnOrdinaryIncome,
      stateTaxOnSS,
      stateTaxOnConversions,
      stateTaxOnOrdinaryIncome,
      // Total dollars that physically left the IRA this year: conversion +
      // any conversion tax withheld from the IRA + the effective IRA
      // distribution (max of RMD and voluntary, never the additive sum).
      totalIRAWithdrawal: conversionAmount + conversionTaxFromIRA + effectiveIraDistribution,
      federalTaxOnIRAWithdrawal,
      taxesPaidFromIRA: conversionTaxFromIRA,
      taxesPaidExternally: conversionTaxExternal,
      earlyWithdrawalPenalty,
      iraWithdrawal,
      rothWithdrawal,
      riderFee: yearRiderFee,
    });
  }

  // Apply the tax-credit carryforward pool as a post-pass over the completed
  // results — offsets each year's federal tax and retains the savings as cash.
  // No-op when the client has no credit (byte-identical for existing clients).
  applyTaxCreditCarryforward(results, client.tax_credits);

  return results;
}
