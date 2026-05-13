import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset } from '../utils/age';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { calculateStateTax } from '../modules/state-tax';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '../utils/income';
import { calculateIRMAAWithLookback, calculateIRMAAHeadroom } from '../modules/irmaa';
import {
  calculateMAGI,
  getMarginalBracket,
  getIRMAATier,
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
  let rothBalance = 0;
  let taxableBalance = 0; // Track taxes paid externally

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
    ? new Date(client.date_of_birth).getFullYear()
    : currentYear - clientAge;

  // RMD treatment for remaining IRA balance when conversions don't fully deplete
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';

  // Tax payment source: 'from_ira' means the IRA pays its own taxes
  // (conversion is grossed down); 'from_taxable' means taxes are paid externally
  const payTaxFromIRA = client.tax_payment_source === 'from_ira';

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
    const deductions = getStandardDeduction(client.filing_status, age, currentSpouseAgeForDeduction, year);

    // Step 0: Calculate RMD if client is old enough and still has a traditional IRA balance
    // This handles the case where conversions don't fully deplete the IRA before RMD age
    const rmdResult = calculateRMD({ age, traditionalBalance: boyIRA, birthYear });
    const rmdAmount = Math.min(rmdResult.rmdAmount, boyIRA);
    const iraAfterRmd = boyIRA - rmdAmount;

    // Step 0b: Voluntary withdrawals on top of RMDs (advisor-scheduled).
    // Available IRA = balance after RMD; available Roth = full boyRoth.
    // The IRA portion adds to taxable income alongside the RMD; the Roth
    // portion is tax-free (assumed qualified). Withdrawals happen BEFORE the
    // conversion math so the optimizer sees the right post-withdrawal IRA
    // and the right starting taxable income.
    const wd = resolveWithdrawalsForYear(client, year, iraAfterRmd, boyRoth);
    const iraWithdrawal = wd.iraPulled;
    const rothWithdrawal = wd.rothPulled;
    const iraAfterRmdAndWithdrawal = iraAfterRmd - iraWithdrawal;
    const rothAfterWithdrawal = boyRoth - rothWithdrawal;

    // Existing taxable income (RMD + voluntary IRA withdrawal + other + taxable SS) —
    // used to seed marginal tax calculations and the SS-aware optimizer.
    const existingNonSSIncome = rmdAmount + iraWithdrawal + otherIncome;
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
    // branches below run against the FULL physical IRA (iraAfterRmdAndWithdrawal)
    // — the split happens after the conversion is sized.
    const inSurrenderPeriod = yearOffset < surrenderYears;
    const taxCap = (respectPenaltyFreeLimit && inSurrenderPeriod && payTaxFromIRA)
      ? Math.round(boyIRA * penaltyFreePercent / 100)
      : Number.POSITIVE_INFINITY;
    const effectiveIraForConversion = iraAfterRmdAndWithdrawal;

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
          //     iraAfterRmd. Today's iterative solver. Tax is fully internal.
          //   - Regime B (cap binding): conv = iraAfterRmd - taxCap. The IRA
          //     distributes exactly (conv + taxCap) = iraAfterRmd (still
          //     "empties" the IRA in carrier terms), and the tax overflow
          //     (tax(conv) − taxCap) is funded externally. Conversion stays
          //     as large as physically possible; only the tax dollars trip
          //     the cap.
          // Detection: try Regime B first. If tax(iraAfterRmd − taxCap) > taxCap,
          // we're genuinely cap-bound. Otherwise fall through to Regime A.
          let useRegimeB = false;
          if (taxCap !== Number.POSITIVE_INFINITY) {
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
        // Pre-conversion MAGI = baseline taxable + tax-exempt + SSI (no conversion yet)
        const preConversionGrossTaxable = rmdAmount + otherIncome;
        const preConversionMagi =
          calculateMAGI(preConversionGrossTaxable, taxExemptNonSSI) +
          primarySsIncome + spouseSsIncome;

        const irmaaHeadroom = calculateIRMAAHeadroom(
          preConversionMagi,
          client.filing_status,
          year
        );

        // If headroom is Infinity, client is past the top IRMAA tier —
        // further conversions don't increase IRMAA, so don't cap.
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
    const conversionTaxFromIRA = payTaxFromIRA
      ? Math.min(taxCap, conversionTaxBeforeSplit)
      : 0;
    const conversionTaxExternal = payTaxFromIRA
      ? Math.max(0, conversionTaxBeforeSplit - conversionTaxFromIRA)
      : 0;
    const iraAfterConversion = iraAfterRmdAndWithdrawal - conversionAmount - conversionTaxFromIRA;
    const rothAfterConversion = rothAfterWithdrawal + conversionAmount;

    // Track cumulative withdrawals for the principal protection floor.
    // Voluntary IRA pulls reduce the floor base just like RMDs/conversions do.
    cumulativeWithdrawn += rmdAmount + iraWithdrawal + conversionAmount + conversionTaxFromIRA;
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
    const grossNonSSIncome = conversionAmount + conversionTaxFromIRA + rmdAmount + otherIncome;
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
    const hasIraDistribution = conversionAmount + conversionTaxFromIRA + rmdAmount + iraWithdrawal > 0;
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

    // IRMAA (Medicare surcharge, age 65+ only, uses 2-year lookback)
    let irmaaSurcharge = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
    }
    const irmaaTier = getIRMAATier(magi, client.filing_status);

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
    const conversionFedStateTax = conversionFederalTax + conversionStateTax;
    const taxFromTaxableAccount = rmdTreatment === 'spent'
      ? (payTaxFromIRA ? 0 : conversionFedStateTax)
      : (payTaxFromIRA ? Math.max(0, totalTax - conversionTaxFromIRA) : totalTax);

    // Cash flow: RMD proceeds flow INTO taxable account (per rmd_treatment)
    // Conversion taxes flow OUT (paid from external funds, reducing taxable balance).
    //
    // CLAMP AT $0 (Jorge V., ticket 809a5774): once both qualified buckets
    // and the taxable account are drained, the engine was previously letting
    // taxableBalance drift negative each year by the year's tax bill — which
    // misrepresents the report (chart goes deep into negative territory,
    // "$0 to heirs" headlines, etc.) for clients with real external income
    // (SS, non_ssi_income) that would actually fund the tax. We clamp at 0
    // here as the simplest honest representation: "the portfolio has nothing
    // left to fund this tax — the client paid it from their living-expense
    // income, the portfolio just stays at 0." TODO: a proper fix (option B,
    // tracked in audit notes) would credit external income against tax
    // bills BEFORE deducting from taxable, which is more accurate but a
    // bigger rewrite. Revisit if the simpler clamp ever produces a misleading
    // case.
    const desiredTaxableBalance = rmdTreatment === 'spent'
      ? boyTaxable - taxFromTaxableAccount
      : boyTaxable + rmdAmount - taxFromTaxableAccount;
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
    const taxableGrowth = 0; // No growth on taxable (just pays taxes)

    // Tax component breakdown. Marginal conversion tax was computed above
    // (conversionFederalTax / conversionStateTax). The remainder is split
    // between ordinary (RMD + other) and the taxable-SS portion.
    const federalTaxOnConversions = conversionFederalTax;
    const stateTaxOnConversions = conversionStateTax;
    const residualFederalTax = Math.max(0, federalTax - federalTaxOnConversions);
    const residualStateTax = Math.max(0, stateTax - stateTaxOnConversions);
    const ordinaryBaseline = rmdAmount + otherIncome;
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
      totalIRAWithdrawal: conversionAmount + conversionTaxFromIRA + rmdAmount + iraWithdrawal,
      federalTaxOnIRAWithdrawal,
      taxesPaidFromIRA: conversionTaxFromIRA,
      taxesPaidExternally: conversionTaxExternal,
      earlyWithdrawalPenalty,
      iraWithdrawal,
      rothWithdrawal,
      riderFee: yearRiderFee,
    });
  }

  return results;
}
