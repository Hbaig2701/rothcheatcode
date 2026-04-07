import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import { getAgeAtYearOffset } from '../utils/age';
import { calculateOptimalConversion, calculateConversionFederalTax } from '../modules/federal-tax';
import { calculateConversionStateTax } from '../modules/state-tax';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getStateTaxRate } from '@/lib/data/states';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '../utils/income';
import { calculateIRMAAWithLookback } from '../modules/irmaa';
import { calculateMAGI, calculateAGI, getMarginalBracket, getIRMAATier } from '../tax-helpers';
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
  const growthRate = (client.rate_of_return ?? 7) / 100;

  // Apply upfront premium bonus at issue
  const bonusPercent = client.bonus_percent ?? 0;
  const initialValue = client.qualified_account_value ?? 0;
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

    // Other income for bracket calculations (year-specific from income table)
    const otherIncome = getNonSSIIncomeForYear(client, year);

    // Standard deduction (age-adjusted)
    const deductions = getStandardDeduction(client.filing_status, age, undefined, year);

    // Existing taxable income (before conversion)
    const existingTaxableIncome = Math.max(0, otherIncome - deductions);

    // Step 1: Handle Roth conversions BEFORE interest (so conversion is based on BOY balance)
    let conversionAmount = 0;
    let federalTax = 0;
    let stateTax = 0;

    const shouldConvert = conversionType !== 'no_conversion' &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          boyIRA > 0;

    if (shouldConvert) {
      // Determine conversion amount based on type
      if (conversionType === 'full_conversion') {
        conversionAmount = boyIRA;
      } else if (conversionType === 'fixed_amount' && fixedConversionAmount > 0) {
        // Fixed amount: convert specified amount per year (or remaining balance if less)
        conversionAmount = Math.min(fixedConversionAmount, boyIRA);
      } else {
        // optimized_amount: fill up to target bracket ceiling
        conversionAmount = calculateOptimalConversion(
          boyIRA,
          existingTaxableIncome,
          maxTaxRate,
          client.filing_status,
          year
        );
      }

      // Calculate taxes on conversion
      if (conversionAmount > 0) {
        federalTax = calculateConversionFederalTax(
          conversionAmount,
          existingTaxableIncome,
          client.filing_status,
          year
        );

        stateTax = calculateConversionStateTax(
          conversionAmount,
          client.state,
          stateTaxRateDecimal
        );
      }
    }

    // Execute conversion
    const iraAfterConversion = boyIRA - conversionAmount;
    const rothAfterConversion = boyRoth + conversionAmount;

    // Step 2: Calculate interest AFTER conversion
    const iraInterest = Math.round(iraAfterConversion * growthRate);
    const rothInterest = Math.round(rothAfterConversion * growthRate);

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

    // Step 4: Calculate surrender value on IRA (annuity AV)
    let surrenderChargePercent: number | undefined;
    let surrenderValue: number | undefined;
    if (surrenderSchedule && surrenderSchedule.length > 0) {
      surrenderChargePercent = yearOffset < surrenderSchedule.length
        ? surrenderSchedule[yearOffset]
        : 0; // No charge after surrender period
      surrenderValue = Math.round(iraBalance * (1 - surrenderChargePercent / 100));
    }

    // Calculate tax calculation details (needed for IRMAA before totalTax)
    const totalIncome = conversionAmount + otherIncome;
    const agi = calculateAGI(totalIncome);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year);
    const magi = calculateMAGI(totalIncome, taxExemptNonSSI);
    const standardDeduction = deductions;
    const taxableIncome = Math.max(0, totalIncome - standardDeduction);
    const federalTaxBracket = getMarginalBracket(taxableIncome, client.filing_status);

    // Store MAGI for IRMAA 2-year lookback
    incomeHistory.set(year, magi);

    // IRMAA (Medicare surcharge, age 65+ only, uses 2-year lookback)
    let irmaaSurcharge = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
    }
    const irmaaTier = getIRMAATier(magi, client.filing_status);

    // Taxes paid from external funds (taxable account goes negative)
    const totalTax = federalTax + stateTax + irmaaSurcharge;
    taxableBalance = boyTaxable - totalTax;

    // Product bonus applied this year (anniversary bonus if within bonus years)
    const productBonusApplied = anniversaryBonusPercent > 0 && yearOffset < anniversaryBonusYears
      ? Math.round((iraAfterConversion + iraInterest) * anniversaryBonusPercent)
      : 0;

    // Calculate display growth/interest for each account
    const traditionalGrowth = iraInterest + productBonusApplied;
    const rothGrowth = rothInterest;
    const taxableGrowth = 0; // No growth on taxable (just pays taxes)

    // Tax component breakdown (all conversion tax, no SS or ordinary income in Growth FIA)
    const federalTaxOnConversions = federalTax;
    const stateTaxOnConversions = stateTax;

    results.push({
      year,
      age,
      spouseAge: null,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount: 0,
      conversionAmount,
      ssIncome: 0,
      pensionIncome: 0,
      otherIncome,
      totalIncome,
      federalTax,
      stateTax,
      niitTax: 0,
      irmaaSurcharge,
      totalTax,
      taxableSS: 0,
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
      taxableIncome,
      federalTaxBracket,
      irmaaTier,
      federalTaxOnSS: 0,
      federalTaxOnConversions,
      federalTaxOnOrdinaryIncome: 0,
      stateTaxOnSS: 0,
      stateTaxOnConversions,
      stateTaxOnOrdinaryIncome: 0,
    });
  }

  return results;
}
