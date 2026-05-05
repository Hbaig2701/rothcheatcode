import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import type { WidowTaxImpact, WidowAnalysisResult } from './types';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { computeTaxableIncomeWithSS } from '../tax-helpers';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { calculateIRMAA } from '../modules/irmaa';
import { runWidowScenario } from '../scenarios/widow';
import { runBaselineScenario } from '../scenarios/baseline';
import { adjustForInflation } from '../modules/inflation';

/**
 * Calculate tax impact for a single year of married vs widow filing
 * Shows the bracket shift penalty
 */
export function calculateWidowTaxImpact(input: {
  marriedIncome: number;    // Taxable income when married (cents)
  widowIncome: number;      // Taxable income as single (cents)
  year: number;
  marriedAge: number;
  spouseAge?: number;
}): WidowTaxImpact {
  const { marriedIncome, widowIncome, year, marriedAge, spouseAge } = input;

  // Get deductions for each status
  const marriedDeduction = getStandardDeduction(
    'married_filing_jointly',
    marriedAge,
    spouseAge
  );
  const singleDeduction = getStandardDeduction('single', marriedAge, undefined);

  // Calculate taxable income after deductions
  const marriedTaxableIncome = calculateTaxableIncome(marriedIncome, marriedDeduction);
  const singleTaxableIncome = calculateTaxableIncome(widowIncome, singleDeduction);

  // Calculate taxes
  const marriedTaxResult = calculateFederalTax({
    taxableIncome: marriedTaxableIncome,
    filingStatus: 'married_filing_jointly',
    taxYear: year,
  });

  const singleTaxResult = calculateFederalTax({
    taxableIncome: singleTaxableIncome,
    filingStatus: 'single',
    taxYear: year,
  });

  return {
    marriedTax: marriedTaxResult.totalTax,
    marriedBracket: marriedTaxResult.marginalBracket,
    singleTax: singleTaxResult.totalTax,
    singleBracket: singleTaxResult.marginalBracket,
    taxIncrease: singleTaxResult.totalTax - marriedTaxResult.totalTax,
    bracketJump: singleTaxResult.marginalBracket - marriedTaxResult.marginalBracket,
  };
}

/**
 * Resolve the death year used to anchor the widow's analysis. Priority:
 *   1. `client.widow_death_age` — advisor's explicit override (UI: "First-Death Age").
 *      Resolved against the OLDER spouse's birth year so the resulting calendar
 *      year matches the advisor's expectation ("first to die at age N").
 *   2. Older spouse's birth year + 85 (life-expectancy heuristic) when DOB known.
 *   3. 15 years from now (last-resort default).
 *
 * Past anchors are passed through unmodified — they reflect "death already
 * happened, treat the entire projection as widow" which is a legitimate
 * scenario. The for-loop in the analyzer skips years before the death year,
 * and a past anchor naturally means no years are skipped.
 */
function getDefaultDeathYear(client: Client): number {
  const currentYear = new Date().getFullYear();

  // Resolve a birth year for each spouse. Prefer DOB; fall back to age.
  // Number.isFinite guards against malformed DOB strings (e.g. "" or "not-a-date")
  // producing NaN, which would silently propagate as NaN death year.
  const toBirthYear = (dob: string | null, age: number | null | undefined): number | null => {
    if (dob) {
      const parsed = new Date(dob).getFullYear();
      if (Number.isFinite(parsed)) return parsed;
    }
    if (age != null && Number.isFinite(age) && age > 0) {
      return currentYear - age;
    }
    return null;
  };

  const clientBirthYear = toBirthYear(client.date_of_birth, client.age);
  const spouseBirthYear = toBirthYear(client.spouse_dob, client.spouse_age);

  let olderBirthYear: number | null = null;
  if (clientBirthYear !== null && spouseBirthYear !== null) {
    olderBirthYear = Math.min(clientBirthYear, spouseBirthYear); // earlier birth = older spouse
  } else {
    olderBirthYear = clientBirthYear ?? spouseBirthYear;
  }

  // Advisor override: "first to die at age N" anchored on the older spouse.
  // If no birth year is available we still honor the override by treating
  // widow_death_age as "years from now" — silently dropping the advisor's
  // explicit choice would be worse than this fallback.
  if (client.widow_death_age != null) {
    if (olderBirthYear !== null) {
      return olderBirthYear + client.widow_death_age;
    }
    return currentYear + client.widow_death_age;
  }

  // Heuristic default: older spouse + 85. If older spouse is already past 85
  // (rare but possible — e.g., advisor illustrating an existing widow),
  // the resulting past year naturally means "treat all years as widow."
  if (olderBirthYear !== null) {
    return olderBirthYear + 85;
  }

  return currentYear + 15;
}

/**
 * Full widow's penalty analysis
 * Compares married baseline vs single-filer widow scenario
 */
export function analyzeWidowPenalty(
  client: Client,
  deathYear?: number
): WidowAnalysisResult {
  // Only applicable for married filers
  if (client.filing_status !== 'married_filing_jointly') {
    throw new Error('Widow analysis only applicable for married filing jointly');
  }

  const currentYear = new Date().getFullYear();
  const resolvedDeathYear = deathYear ?? getDefaultDeathYear(client);

  // Years from now to death
  const yearsToDeathYear = resolvedDeathYear - currentYear;
  const totalProjection = client.projection_years ?? 30;

  // Run pre-death as married (baseline scenario)
  const preDeathScenario = runBaselineScenario(
    client,
    currentYear,
    Math.min(yearsToDeathYear, totalProjection)
  );

  // Run post-death as single
  const postDeathYears = totalProjection - yearsToDeathYear;
  const postDeathScenario = postDeathYears > 0
    ? runWidowScenario({
        client,
        deathYear: resolvedDeathYear,
        projectionYears: postDeathYears,
      })
    : [];

  // Calculate tax impact year by year (post-death)
  const taxImpactByYear: WidowTaxImpact[] = [];
  let totalAdditionalTax = 0;
  const inflationRate = (client.inflation_rate ?? 2.5) / 100;

  for (let i = 0; i < postDeathScenario.length; i++) {
    const widowYear = postDeathScenario[i];
    const yearsFromNow = yearsToDeathYear + i;

    // Estimate what married income would have been (with spouse SS)
    const spouseSS = adjustForInflation(
      client.ss_spouse ?? 0,
      yearsFromNow,
      inflationRate
    );
    const estimatedMarriedIncome = widowYear.totalIncome + spouseSS;

    const impact = calculateWidowTaxImpact({
      marriedIncome: estimatedMarriedIncome,
      widowIncome: widowYear.totalIncome,
      year: widowYear.year,
      marriedAge: widowYear.age,
    });

    taxImpactByYear.push(impact);
    totalAdditionalTax += impact.taxIncrease;
  }

  // Calculate recommended conversion increase
  // Goal: Pre-convert enough to reduce traditional balance and RMDs
  // Rough heuristic: Increase conversion to fill single 22% bracket instead of 12%
  const avgBracketJump = taxImpactByYear.length > 0
    ? taxImpactByYear.reduce((sum, t) => sum + t.bracketJump, 0) / taxImpactByYear.length
    : 0;

  // Simplified: recommend converting enough to stay in current bracket
  // More sophisticated: would need to model optimal conversion amounts
  const recommendedIncrease = avgBracketJump > 5
    ? Math.round(totalAdditionalTax / postDeathScenario.length) // Spread tax prepayment
    : 0;

  return {
    deathYear: resolvedDeathYear,
    preDeathScenario,
    postDeathScenario,
    taxImpactByYear,
    totalAdditionalTax,
    recommendedConversionIncrease: recommendedIncrease,
  };
}

// ===========================================================================
// Engine-aware widow analysis (Option 2) — works for Growth FIA + GI clients
// ===========================================================================
//
// The legacy `analyzeWidowPenalty` above re-runs its own pre-death and post-death
// simulations, which don't model FIA bonuses, surrender mechanics, GI roll-up,
// etc. That's why the API has historically gated widow analysis off for Growth
// and GI clients — running the legacy analyzer would produce numbers that
// conflict with the main projection.
//
// This function takes a shortcut: it consumes the *already-computed* strategy
// projection (which has the correct engine-specific math baked in) and
// re-prices each year from the death year forward using Single-filer brackets,
// the smaller standard deduction, and the surviving spouse's SS check only.
// The "married tax" comparison is the original year's federal tax + IRMAA —
// what the joint household actually paid. The delta is the widow's penalty.
//
// Tradeoff vs. a full re-simulation: this assumes the surviving spouse keeps
// the same conversion strategy (doesn't downshift to fit Single brackets).
// For the widow's-trap sales narrative — "here's what happens if you DON'T
// plan ahead" — that assumption is exactly the warning advisors deliver.
// ===========================================================================

interface AnalyzeWidowFromProjectionInput {
  client: Client;
  /** Strategy projection years (e.g., result.formula from runGrowthSimulation) */
  formulaYears: YearlyResult[];
  /** Optional override; defaults to older spouse's life-expectancy-ish */
  deathYear?: number;
}

export function analyzeWidowPenaltyFromProjection(
  input: AnalyzeWidowFromProjectionInput
): WidowAnalysisResult {
  const { client, formulaYears } = input;

  if (client.filing_status !== 'married_filing_jointly') {
    throw new Error('Widow analysis only applicable for married filing jointly');
  }
  if (formulaYears.length === 0) {
    throw new Error('Widow analysis requires at least one projection year');
  }

  const resolvedDeathYear = input.deathYear ?? getDefaultDeathYear(client);

  // SS amounts in cents at year 0 (un-inflated)
  const primarySS = client.ssi_annual_amount ?? client.ss_self ?? 0;
  const spouseSS = client.spouse_ssi_annual_amount ?? client.ss_spouse ?? 0;
  // Survivor takes the larger of the two SS checks (Social Security survivor rule)
  const survivorBaseSS = Math.max(primarySS, spouseSS);
  const ssColaRate = 0.02; // Match engine's SS COLA assumption

  const taxImpactByYear: WidowTaxImpact[] = [];
  let totalAdditionalTax = 0;

  for (const yearData of formulaYears) {
    // Pre-death: no widow impact this year
    if (yearData.year < resolvedDeathYear) continue;

    // Years since SS started — used for COLA
    const ssStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
    const yearsCollecting = yearData.age >= ssStartAge ? yearData.age - ssStartAge : 0;
    const inflatedSurvivorSS = Math.round(
      survivorBaseSS * Math.pow(1 + ssColaRate, yearsCollecting)
    );

    // Other income = whatever made up the year's totalIncome minus the household SS.
    // RMDs, conversions, pensions, rental, etc. all carry forward as the survivor's.
    const otherIncome = Math.max(0, yearData.totalIncome - yearData.ssIncome);
    const taxExemptInterest = 0; // Existing analyzer doesn't model this either

    // === Married baseline: what the joint household actually paid this year ===
    // Pull straight from the engine projection — already correct for the product
    // type (Growth FIA bonuses, GI rider fees, etc. are baked in).
    const marriedFederalTax = yearData.federalTax;
    const marriedIRMAA = yearData.irmaaSurcharge;
    const marriedTotalFederal = marriedFederalTax + marriedIRMAA;
    const marriedBracket = yearData.federalTaxBracket ?? 0;

    // === Single (widow) re-price for the same year's economic activity ===
    const widowDeduction = getStandardDeduction(
      'single',
      yearData.age,
      undefined,
      yearData.year
    );
    const widowTaxInfo = computeTaxableIncomeWithSS({
      otherIncome,
      ssBenefits: inflatedSurvivorSS,
      taxExemptInterest,
      deductions: widowDeduction,
      filingStatus: 'single',
    });
    const widowFederalResult = calculateFederalTax({
      taxableIncome: widowTaxInfo.taxableIncome,
      filingStatus: 'single',
      taxYear: yearData.year,
    });
    // IRMAA at Single thresholds (single brackets are roughly half MFJ)
    const widowMagi =
      widowTaxInfo.agi + taxExemptInterest + (inflatedSurvivorSS - widowTaxInfo.taxableSS);
    const widowIRMAAResult =
      yearData.age >= 65
        ? calculateIRMAA({ magi: widowMagi, filingStatus: 'single' })
        : { annualSurcharge: 0 };
    const widowFederalTax = widowFederalResult.totalTax;
    const widowIRMAA = widowIRMAAResult.annualSurcharge;
    const widowTotalFederal = widowFederalTax + widowIRMAA;
    const widowBracket = widowFederalResult.marginalBracket;

    const taxIncrease = widowTotalFederal - marriedTotalFederal;

    taxImpactByYear.push({
      marriedTax: marriedTotalFederal,
      marriedBracket,
      singleTax: widowTotalFederal,
      singleBracket: widowBracket,
      taxIncrease,
      bracketJump: widowBracket - marriedBracket,
    });
    totalAdditionalTax += taxIncrease;
  }

  // Recommend pre-conversion if the average bracket jump is meaningful
  const avgBracketJump =
    taxImpactByYear.length > 0
      ? taxImpactByYear.reduce((s, t) => s + t.bracketJump, 0) / taxImpactByYear.length
      : 0;
  const recommendedIncrease =
    avgBracketJump > 5 && taxImpactByYear.length > 0
      ? Math.round(totalAdditionalTax / taxImpactByYear.length)
      : 0;

  return {
    deathYear: resolvedDeathYear,
    // The legacy WidowAnalysisResult shape expects pre/post-death scenario arrays.
    // For the engine-aware path we don't re-run a separate simulation, so we
    // return empty arrays — the UI only renders taxImpactByYear + totals.
    preDeathScenario: [],
    postDeathScenario: [],
    taxImpactByYear,
    totalAdditionalTax,
    recommendedConversionIncrease: recommendedIncrease,
  };
}
