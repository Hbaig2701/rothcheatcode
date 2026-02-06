/**
 * Growth FIA Calculation Engine
 *
 * Handles calculations for Growth Fixed Index Annuity products:
 * - Compound interest on account value
 * - Surrender value (account value - surrender charge)
 * - Bonus schedules (upfront and anniversary)
 * - Roth conversion tracking
 */

export interface ProductConfig {
  id: string;
  carrier: string;
  product: string;
  surrenderYears: number;
  surrenderSchedule: number[]; // Percentages for each year, e.g., [9, 8, 7, 6, 5, 4, 3] for 7-year
  bonus: number; // Total bonus percentage
  bonusSchedule: BonusScheduleItem[] | null;
}

export interface BonusScheduleItem {
  timing: 'issue' | 'anniversary1' | 'anniversary2' | 'anniversary3';
  percentage: number;
}

export interface GrowthInputs {
  product: string;
  clientAge: number;
  qualifiedAccountValue: number;
  rateOfReturn: number; // Percentage, e.g., 5 for 5%
  endAge: number;
  conversionType: 'none' | 'fixed';
  conversionAmount?: number;
  conversionStartAge?: number;
  conversionEndAge?: number;
  federalTaxRate?: number;
  stateTaxRate?: number;
  heirTaxRate?: number;
}

export interface YearlyData {
  year: number;
  age: number;
  boyAccountValue: number;
  interest: number;
  anniversaryBonus: number;
  accountValueEOY: number;
  surrenderChargePercent: number;
  surrenderValue: number;
  conversionAmount: number;
  conversionTax: number;
  iraBalance: number; // Traditional IRA balance (same as accountValueEOY for non-conversion)
  rothBalance: number;
}

export interface GrowthSummary {
  finalAccountValue: number;
  finalSurrenderValue: number;
  totalInterestEarned: number;
  totalBonusesReceived: number;
  finalRothBalance: number;
  totalConverted: number;
  totalConversionTaxes: number;
  grossLegacy: number;
  netLegacy: number;
}

export interface GrowthProjectionResult {
  yearlyData: YearlyData[];
  summary: GrowthSummary;
}

/**
 * Calculate Growth FIA projection
 */
export function calculateGrowthProjection(
  inputs: GrowthInputs,
  productConfig: ProductConfig
): GrowthProjectionResult {
  const yearlyData: YearlyData[] = [];
  const growthRate = inputs.rateOfReturn / 100;
  const projectionYears = inputs.endAge - inputs.clientAge + 1;

  // Get bonus schedule info
  const upfrontBonusPercent = getUpfrontBonusPercent(productConfig);
  const anniversaryBonusPercents = getAnniversaryBonusPercents(productConfig);

  // Apply upfront bonus at issue
  let accountValue = inputs.qualifiedAccountValue * (1 + upfrontBonusPercent / 100);
  let rothBalance = 0;
  let totalInterest = 0;
  let totalBonuses = inputs.qualifiedAccountValue * (upfrontBonusPercent / 100);
  let totalConverted = 0;
  let totalConversionTaxes = 0;

  // Tax rates for conversions
  const federalTaxRate = (inputs.federalTaxRate ?? 24) / 100;
  const stateTaxRate = (inputs.stateTaxRate ?? 0) / 100;
  const totalTaxRate = federalTaxRate + stateTaxRate;
  const heirTaxRate = (inputs.heirTaxRate ?? 35) / 100;

  for (let yearIndex = 0; yearIndex < projectionYears; yearIndex++) {
    const year = yearIndex + 1;
    const age = inputs.clientAge + yearIndex;
    const boyAccountValue = accountValue;
    const boyRoth = rothBalance;

    // Step 1: Calculate interest on IRA
    const interest = roundTo2(boyAccountValue * growthRate);
    let valueAfterInterest = boyAccountValue + interest;
    totalInterest += interest;

    // Step 2: Add anniversary bonus if applicable (years 1, 2, 3)
    let anniversaryBonus = 0;
    if (year <= 3 && anniversaryBonusPercents[year - 1] > 0) {
      // Anniversary bonus is calculated on value AFTER interest
      anniversaryBonus = roundTo2(valueAfterInterest * (anniversaryBonusPercents[year - 1] / 100));
      valueAfterInterest += anniversaryBonus;
      totalBonuses += anniversaryBonus;
    }

    // Step 3: Handle Roth conversions
    let conversionAmount = 0;
    let conversionTax = 0;

    if (inputs.conversionType === 'fixed' &&
        inputs.conversionAmount &&
        inputs.conversionStartAge !== undefined &&
        inputs.conversionEndAge !== undefined &&
        age >= inputs.conversionStartAge &&
        age <= inputs.conversionEndAge) {

      // Convert up to the specified amount or remaining balance
      conversionAmount = Math.min(inputs.conversionAmount, valueAfterInterest);
      conversionTax = roundTo2(conversionAmount * totalTaxRate);
      totalConverted += conversionAmount;
      totalConversionTaxes += conversionTax;

      // Deduct conversion from IRA
      valueAfterInterest -= conversionAmount;
    }

    // Step 4: Grow existing Roth balance, then add new conversion
    const rothGrowth = roundTo2(boyRoth * growthRate);
    rothBalance = boyRoth + rothGrowth + conversionAmount;

    // Update account value
    accountValue = valueAfterInterest;

    // Step 5: Calculate surrender value
    const surrenderChargePercent = getSurrenderChargePercent(year, productConfig);
    const surrenderValue = roundTo2(accountValue * (1 - surrenderChargePercent / 100));

    yearlyData.push({
      year,
      age,
      boyAccountValue: roundTo2(boyAccountValue),
      interest: roundTo2(interest),
      anniversaryBonus: roundTo2(anniversaryBonus),
      accountValueEOY: roundTo2(accountValue),
      surrenderChargePercent,
      surrenderValue,
      conversionAmount: roundTo2(conversionAmount),
      conversionTax: roundTo2(conversionTax),
      iraBalance: roundTo2(accountValue),
      rothBalance: roundTo2(rothBalance),
    });
  }

  // Calculate final values
  const finalAccountValue = roundTo2(accountValue);
  const finalSurrenderValue = yearlyData[yearlyData.length - 1]?.surrenderValue ?? 0;
  const finalRothBalance = roundTo2(rothBalance);

  // Legacy calculations
  const grossLegacy = roundTo2(finalAccountValue + finalRothBalance);
  // IRA is taxed at heir rate, Roth is tax-free
  const netLegacy = roundTo2(finalAccountValue * (1 - heirTaxRate) + finalRothBalance);

  return {
    yearlyData,
    summary: {
      finalAccountValue,
      finalSurrenderValue,
      totalInterestEarned: roundTo2(totalInterest),
      totalBonusesReceived: roundTo2(totalBonuses),
      finalRothBalance,
      totalConverted: roundTo2(totalConverted),
      totalConversionTaxes: roundTo2(totalConversionTaxes),
      grossLegacy,
      netLegacy,
    },
  };
}

/**
 * Get upfront bonus percentage from product config
 */
function getUpfrontBonusPercent(config: ProductConfig): number {
  if (!config.bonusSchedule) return 0;

  const upfrontItem = config.bonusSchedule.find(item => item.timing === 'issue');
  return upfrontItem?.percentage ?? 0;
}

/**
 * Get anniversary bonus percentages (for years 1, 2, 3)
 */
function getAnniversaryBonusPercents(config: ProductConfig): number[] {
  if (!config.bonusSchedule) return [0, 0, 0];

  const result = [0, 0, 0];
  for (const item of config.bonusSchedule) {
    if (item.timing === 'anniversary1') result[0] = item.percentage;
    else if (item.timing === 'anniversary2') result[1] = item.percentage;
    else if (item.timing === 'anniversary3') result[2] = item.percentage;
  }
  return result;
}

/**
 * Get surrender charge percentage for a given year
 */
function getSurrenderChargePercent(year: number, config: ProductConfig): number {
  const index = year - 1;
  if (index < 0 || index >= config.surrenderSchedule.length) {
    return 0; // No surrender charge after surrender period
  }
  return config.surrenderSchedule[index];
}

/**
 * Round to 2 decimal places
 */
function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Export for CommonJS compatibility
module.exports = { calculateGrowthProjection };
