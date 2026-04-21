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
  calculateConversionTaxWithSS,
} from '../tax-helpers';
import { calculateRMD } from '../modules/rmd';
import { ALL_PRODUCTS, type FormulaType } from '@/lib/config/products';

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
  projectionYears: number
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

  // Anniversary bonus (Phased Bonus Growth: 4% at end of years 1, 2, 3)
  const anniversaryBonusPercent = (client.anniversary_bonus_percent ?? 0) / 100;
  const anniversaryBonusYears = client.anniversary_bonus_years ?? 0;

  // Surrender schedule (array of charge percentages by year)
  const surrenderSchedule = client.surrender_schedule ?? null;

  // Rider fee (from product preset, only applied during surrender period)
  const productConfig = ALL_PRODUCTS[client.blueprint_type as FormulaType];
  const riderFeePercent = (productConfig?.defaults.riderFee ?? 0) / 100;
  const surrenderYears = client.surrender_years ?? 0;

  // SSI parameters (per spec, SSI is treated as tax-exempt but still displayed)
  const primarySsStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? client.ss_self ?? 0;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;
  const initialSpouseAge = client.spouse_age ?? null;
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
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;
  const conversionEndAge = client.end_age ?? 100;

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

    // Existing taxable income (RMD + other + taxable SS) — used to seed
    // marginal tax calculations and the SS-aware optimizer.
    const existingNonSSIncome = rmdAmount + otherIncome;
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

    const shouldConvert = conversionType !== 'no_conversion' &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          iraAfterRmd > 100; // Skip dust balances under $1 (residuals absorbed by solver)

    // Flag: when we've already solved the from-IRA tax math exactly (e.g. for
    // full_conversion), skip the generic gross-down below to avoid shrinking
    // the conversion twice.
    let skipGrossDown = false;

    if (shouldConvert) {
      // Determine conversion amount based on type
      if (conversionType === 'full_conversion') {
        if (payTaxFromIRA) {
          // Special case: "empty the IRA" when taxes are paid from the IRA.
          // We want conversion + tax = iraAfterRmd. Solve iteratively using
          // the SS-aware marginal tax calculation (converges in 2-3 iterations).
          let solved = iraAfterRmd * (1 - (maxTaxRate / 100 + stateTaxRateDecimal));
          for (let i = 0; i < 5; i++) {
            const { federalTax: fTax, stateTax: sTax } = convTaxAt(solved);
            solved = iraAfterRmd - fTax - sTax;
          }
          conversionAmount = Math.max(0, Math.round(solved));
          const { federalTax: fcVerifyF, stateTax: fcVerifyS } = convTaxAt(conversionAmount);
          const fcResidual = iraAfterRmd - conversionAmount - fcVerifyF - fcVerifyS;
          if (fcResidual > 0 && fcResidual < 50000) {
            conversionAmount += fcResidual;
          }
          skipGrossDown = true;
        } else {
          conversionAmount = iraAfterRmd;
        }
      } else if (conversionType === 'fixed_amount' && fixedConversionAmount > 0) {
        // Fixed amount: convert specified amount per year (or remaining balance if less).
        if (payTaxFromIRA) {
          const estEffRate = maxTaxRate / 100 + stateTaxRateDecimal;
          const maxConvWithTax = Math.floor(iraAfterRmd / (1 + estEffRate));
          if (maxConvWithTax < fixedConversionAmount) {
            let solved = iraAfterRmd * (1 - estEffRate);
            for (let i = 0; i < 5; i++) {
              const { federalTax: fTax, stateTax: sTax } = convTaxAt(solved);
              solved = iraAfterRmd - fTax - sTax;
            }
            conversionAmount = Math.max(0, Math.round(solved));
            const { federalTax: verifyFTax, stateTax: verifySTax } = convTaxAt(conversionAmount);
            const residual = iraAfterRmd - conversionAmount - verifyFTax - verifySTax;
            if (residual > 0 && residual < 50000) {
              conversionAmount += residual;
            }
          } else {
            conversionAmount = fixedConversionAmount;
          }
          skipGrossDown = true;
        } else {
          conversionAmount = Math.min(fixedConversionAmount, iraAfterRmd);
        }
      } else {
        // optimized_amount: fill up to target bracket ceiling with SS taxation
        // correctly accounted for (tax torpedo).
        conversionAmount = calculateSSAwareOptimalConversion({
          iraBalance: iraAfterRmd,
          otherIncome: existingNonSSIncome,
          ssBenefits: ssIncome,
          taxExemptInterest: taxExemptNonSSI,
          deductions,
          maxBracketRate: maxTaxRate,
          filingStatus: client.filing_status,
          taxYear: year,
        });

        // When paying taxes from IRA, conversion + tax must fit within the IRA.
        if (payTaxFromIRA && conversionAmount > 0) {
          let solved = conversionAmount;
          for (let iter = 0; iter < 4; iter++) {
            const { federalTax: fTax, stateTax: sTax } = convTaxAt(solved);
            const totalNeeded = solved + fTax + sTax;
            if (totalNeeded <= iraAfterRmd) break;
            solved = iraAfterRmd - fTax - sTax;
            solved = Math.max(0, solved);
          }
          conversionAmount = Math.min(solved, conversionAmount);
          skipGrossDown = true;
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
          conversionAmount = Math.min(conversionAmount, irmaaCap);
        }
      }

      // Handle tax payment from IRA (gross-down)
      // When taxes are paid from IRA, the total IRA withdrawal is (conversion + tax).
      // To keep the total withdrawal within the target amount, reduce the portion
      // that actually converts to Roth so there's room for the tax to be paid from the IRA.
      // Skip when full_conversion already solved this exactly above.
      if (payTaxFromIRA && conversionAmount > 0 && !skipGrossDown) {
        const effectiveRate = maxTaxRate / 100 + stateTaxRateDecimal;
        conversionAmount = Math.round(conversionAmount * (1 - effectiveRate));
        conversionAmount = Math.min(conversionAmount, iraAfterRmd);
      }

      // Calculate marginal taxes on conversion (SS-aware delta)
      if (conversionAmount > 0) {
        const convTax = convTaxAt(conversionAmount);
        federalTax = convTax.federalTax;
        stateTax = convTax.stateTax;
      }
    }

    // Execute conversion (on IRA balance already reduced by RMD)
    // When payTaxFromIRA, the IRA also pays the tax, so deduct both from IRA
    const conversionTaxFromIRA = payTaxFromIRA ? (federalTax + stateTax) : 0;
    const iraAfterConversion = iraAfterRmd - conversionAmount - conversionTaxFromIRA;
    const rothAfterConversion = boyRoth + conversionAmount;

    // Track cumulative withdrawals for the principal protection floor
    cumulativeWithdrawn += rmdAmount + conversionAmount + conversionTaxFromIRA;

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
    if (riderFeePercent > 0 && yearOffset < surrenderYears) {
      const riderFeeAmount = Math.round(iraBalance * riderFeePercent);
      iraBalance = iraBalance - riderFeeAmount;
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

    // Tax calculation details with proper SS taxation.
    // KNOWN LIMITATION: when tax_payment_source='from_ira', the tax portion
    // withdrawn from the IRA is itself ordinary income but is NOT added here.
    // This slightly understates reported MAGI and future IRMAA lookback values
    // by the tax-on-tax amount (~$500-1000/year).
    const grossNonSSIncome = conversionAmount + rmdAmount + otherIncome;
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
    const federalTaxBracket = getMarginalBracket(taxableIncomeForTax, client.filing_status);

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

    // Store MAGI for IRMAA 2-year lookback
    incomeHistory.set(year, magi);

    // IRMAA (Medicare surcharge, age 65+ only, uses 2-year lookback)
    let irmaaSurcharge = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
    }
    const irmaaTier = getIRMAATier(magi, client.filing_status);

    // 10% early withdrawal penalty on tax paid from IRA when under 59.5.
    // The conversion itself is penalty-exempt (IRC §72(t)(2)(A)(vi)), but the
    // extra withdrawal to cover taxes IS a taxable distribution subject to the
    // penalty. We use age < 60 as a proxy for "under 59.5" since we track
    // integer ages. The penalty is paid from external funds (not from the IRA).
    const earlyWithdrawalPenalty =
      conversionTaxFromIRA > 0 && age < 60
        ? Math.round(conversionTaxFromIRA * 0.10)
        : 0;

    // Taxes paid from external funds (taxable account goes negative)
    const totalTax = federalTax + stateTax + irmaaSurcharge + earlyWithdrawalPenalty;

    // When payTaxFromIRA, the conversion tax portion was already deducted from
    // the IRA balance above (via conversionTaxFromIRA). Only the non-conversion
    // taxes (RMD tax + IRMAA + penalty) should reduce the taxable account.
    const taxFromTaxableAccount = payTaxFromIRA
      ? Math.max(0, totalTax - conversionTaxFromIRA)
      : totalTax;

    // Cash flow: RMD proceeds flow INTO taxable account (per rmd_treatment)
    // Conversion taxes flow OUT (paid from external funds, reducing taxable balance)
    if (rmdTreatment === 'spent') {
      // RMDs spent on living expenses — don't accumulate
      taxableBalance = boyTaxable - taxFromTaxableAccount;
    } else {
      // 'reinvested' or 'cash': RMD proceeds (minus tax attributable to them) go to taxable
      taxableBalance = boyTaxable + rmdAmount - taxFromTaxableAccount;
    }

    // Product bonus applied this year (anniversary bonus if within bonus years)
    const productBonusApplied = anniversaryBonusPercent > 0 && yearOffset < anniversaryBonusYears
      ? Math.round((iraAfterConversion + iraInterest) * anniversaryBonusPercent)
      : 0;

    // Calculate display growth/interest for each account
    const traditionalGrowth = iraInterest + productBonusApplied;
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
      totalIRAWithdrawal: conversionAmount + conversionTaxFromIRA + rmdAmount,
      taxesPaidFromIRA: conversionTaxFromIRA,
      earlyWithdrawalPenalty,
    });
  }

  return results;
}
