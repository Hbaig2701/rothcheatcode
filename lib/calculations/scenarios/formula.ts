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
  getIRMAATier,
  computeTaxableIncomeWithSS,
  calculateSSAwareOptimalConversion,
  calculateSSAwareIRAWithdrawalPlan,
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
  const useSpouseAgeBased = client.spouse_age !== undefined && client.spouse_age !== null && client.spouse_age > 0;
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

  // Track conversion completion
  let conversionComplete = false;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = useAgeBased ? getAgeAtYearOffset(clientAge, yearOffset) : calculateAge(client.date_of_birth!, year);
    const spouseAge = client.spouse_dob ? calculateAge(client.spouse_dob, year) : null;

    // Beginning of Year balances
    const boyIRA = iraBalance;
    const boyRoth = rothBalance;
    const boyTaxable = taxableBalance;
    const boyCombined = boyIRA + boyRoth;

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
    const taxInfoNoConv = computeTaxableIncomeWithSS({
      otherIncome,
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

    // Check if we should convert this year
    const shouldConvert = !conversionComplete &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          boyIRA > 0;

    // The IRA withdrawal taxable for the year. For external tax payment, only
    // the conversion is a taxable distribution. For internal tax payment, the
    // withheld tax is ALSO a taxable distribution (same 1099-R), so the full
    // conversion + tax-from-IRA is what the IRS sees.
    let totalIRAWithdrawal = 0;

    if (shouldConvert) {
      if (payTaxFromIRA) {
        // Plan the full withdrawal (conversion + tax) as one bracket-filling
        // distribution. Self-consistent: the marginal tax computed is
        // exactly what gets withheld, and the net conversion equals the
        // total minus that tax.
        const plan = calculateSSAwareIRAWithdrawalPlan({
          iraBalance: boyIRA,
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
        conversionTax = federalConversionTax + stateConversionTax;
      } else {
        // External tax: the conversion alone fills the bracket; client writes
        // the tax check from outside funds.
        conversionAmount = calculateSSAwareOptimalConversion({
          iraBalance: boyIRA,
          otherIncome,
          ssBenefits: ssIncome,
          taxExemptInterest: taxExemptNonSSI,
          deductions,
          maxBracketRate: maxTaxRate,
          filingStatus: client.filing_status,
          taxYear: year,
        });
        totalIRAWithdrawal = conversionAmount;

        if (conversionAmount > 0) {
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
          conversionTax = federalConversionTax + stateConversionTax;
        }
      }

      if (boyIRA - conversionAmount <= 0) {
        conversionComplete = true;
      }
    }

    // Execute conversion. When payTaxFromIRA, the IRA funds both the
    // conversion and its marginal tax — together they equal totalIRAWithdrawal.
    const conversionTaxFromIRA = payTaxFromIRA ? (federalConversionTax + stateConversionTax) : 0;
    const iraAfterConversion = boyIRA - conversionAmount - conversionTaxFromIRA;
    const rothAfterConversion = boyRoth + conversionAmount;

    // Interest = (B.O.Y. Balance − Distribution) × Rate
    const iraInterest = Math.round(iraAfterConversion * growthRate);
    const rothInterest = Math.round(rothAfterConversion * growthRate);

    // Final tax picture. The IRS sees the full IRA distribution (conversion
    // AND any tax withheld from the IRA), so we pass totalIRAWithdrawal —
    // not just conversionAmount — when computing the year's taxable income.
    const taxInfoFinal = totalIRAWithdrawal > 0
      ? computeTaxableIncomeWithSS({
          otherIncome: otherIncome + totalIRAWithdrawal,
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
    // IRA distributions. When paying tax from the IRA, the tax withholding
    // is part of that distribution, so we use totalIRAWithdrawal not just
    // conversionAmount — otherwise IRMAA tiers would be under-triggered.
    const grossIncomeWithWithdrawal = otherIncome + totalIRAWithdrawal;
    const magi = grossIncomeWithWithdrawal + taxExemptNonSSI + ssIncome;
    incomeHistory.set(year, magi);

    let irmaaSurcharge = 0;
    if (age >= 65) {
      const irmaaResult = calculateIRMAAWithLookback(year, incomeHistory, client.filing_status);
      irmaaSurcharge = irmaaResult.annualSurcharge;
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

    // Taxable account: deduct non-IRA-funded portion of the year's tax.
    // When payTaxFromIRA, the conversion's marginal tax is already funded by
    // the IRA; only IRMAA, penalty, and any residual (e.g. tax on non-SS
    // income the IRA didn't fund) come from the taxable account.
    if (payTaxFromIRA) {
      taxableBalance = boyTaxable - Math.max(0, totalTax - conversionTaxFromIRA);
    } else {
      taxableBalance = boyTaxable - totalTax;
    }

    // Split federal/state tax between "on conversion" and "on ordinary/SS income"
    // for display breakdowns. Ordinary portion is what remains after subtracting
    // the marginal conversion tax.
    const federalTaxOnOrdinaryAndSS = Math.max(0, federalResult.totalTax - federalConversionTax);
    const stateTaxOnOrdinaryAndSS = Math.max(0, stateResult.totalTax - stateConversionTax);

    const bracket = determineTaxBracket(taxInfoFinal.taxableIncome, client.filing_status, year);
    const totalIncome = grossIncomeWithWithdrawal + ssIncome;
    const irmaaTier = getIRMAATier(magi, client.filing_status, year);
    const federalTaxBracket = getMarginalBracket(taxInfoFinal.taxableIncome, client.filing_status, year);

    results.push({
      year,
      age,
      spouseAge,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance,
      rmdAmount: 0, // No RMDs during conversion phase (converting before RMD age typically)
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
      totalIRAWithdrawal,
      taxesPaidFromIRA: conversionTaxFromIRA,
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
