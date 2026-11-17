import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '../types';
import type { WidowTaxImpact, WidowAnalysisResult } from './types';
import { calculateFederalTax, calculateTaxableIncome } from '../modules/federal-tax';
import { computeTaxableIncomeWithSS, computeIrmaaMagi } from '../tax-helpers';
import { getEffectiveDeduction } from '@/lib/data/standard-deductions';
import { calculateIRMAA } from '../modules/irmaa';
import { runWidowScenario } from '../scenarios/widow';
import { runBaselineScenario } from '../scenarios/baseline';
import { adjustForInflation } from '../modules/inflation';
import { getFirstDeathYear } from '../utils/widow';

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
  additionalDeductions?: number | null;
}): WidowTaxImpact {
  const { marriedIncome, widowIncome, year, marriedAge, spouseAge, additionalDeductions } = input;

  // Get deductions for each status. additionalDeductions is threaded through for
  // completeness but callers now pass null: as of the deduction-isolation change
  // (A, 2026-07) additional_deductions is a STRATEGY-only benefit, absent from the
  // do-nothing baseline/widow projection this penalty compares against, so both
  // filings here stay deduction-free to match. Pass `year` so the standard
  // deduction is inflation-indexed to the SAME year as the tax brackets below
  // (audit F7): previously this passed `undefined` → the brackets inflated to the
  // projection year but the deduction stayed frozen at 2026, overstating the
  // survivor's taxable income and the widow penalty in every future post-death
  // year. The main projection engine inflates both; the widow analysis now matches.
  const marriedDeduction = getEffectiveDeduction(
    'married_filing_jointly',
    marriedAge,
    spouseAge,
    year,
    additionalDeductions
  );
  const singleDeduction = getEffectiveDeduction('single', marriedAge, undefined, year, additionalDeductions);

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
  const resolvedDeathYear = deathYear ?? getFirstDeathYear(client);

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
      // A (deduction isolation): the widow penalty is a do-nothing-world concept,
      // and additional_deductions is now a strategy-only benefit removed from the
      // baseline/widow projection this analysis compares against. Pass null so both
      // the married and single sides here stay deduction-free and consistent with
      // that projection (Mark Nichols audit 2026-07).
      additionalDeductions: null,
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

  const resolvedDeathYear = input.deathYear ?? getFirstDeathYear(client);

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

    // COLA years = min(years-from-projection-start, age - startAge). An already-
    // collecting survivor grows only from the projection start (SS entered in
    // today's dollars) — anchoring to (age - startAge) would re-apply COLA already
    // baked into their current benefit. A future claimant still grows from claim age.
    const ssStartAge = client.ssi_payout_age ?? client.ss_start_age ?? 67;
    const yearsFromStart = yearData.year - formulaYears[0].year;
    const yearsCollecting = yearData.age >= ssStartAge ? Math.min(yearsFromStart, yearData.age - ssStartAge) : 0;
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
    // The married comparator (marriedFederalTax = yearData.federalTax) comes from
    // the STRATEGY projection (formulaYears = baseResult.formula), which DOES apply
    // additional_deductions. So the single re-price must ALSO apply them, or the
    // widow penalty (single − married) is inflated by the tax value of the
    // deduction — an asymmetry, not a filing-status effect. (Fix 2026-07: the
    // prior null assumed a deduction-free do-nothing married side, which was wrong
    // — this path's married side is the strategy, not the baseline.)
    const widowDeduction = getEffectiveDeduction(
      'single',
      yearData.age,
      undefined,
      yearData.year,
      client.additional_deductions
    );
    const widowTaxInfo = computeTaxableIncomeWithSS({
      otherIncome,
      ssBenefits: inflatedSurvivorSS,
      taxExemptInterest,
      deductions: widowDeduction,
      filingStatus: 'single',
      age: yearData.age,
      spouseAge: undefined,
      taxYear: yearData.year,
    });
    const widowFederalResult = calculateFederalTax({
      taxableIncome: widowTaxInfo.taxableIncome,
      filingStatus: 'single',
      taxYear: yearData.year,
    });
    // IRMAA at Single thresholds (single brackets are roughly half MFJ).
    // MAGI = AGI + tax-exempt interest — NOT plus gross SS. The married comparator
    // (yearData.irmaaSurcharge) comes from the corrected main projection, so this
    // survivor re-price must use the same definition or the widow penalty is
    // inflated by a phantom SS-driven IRMAA jump. (Mark Nichols audit 2026-07.)
    const widowMagi = computeIrmaaMagi(widowTaxInfo.agi, taxExemptInterest);
    const widowIRMAAResult =
      yearData.age >= 65
        // year: index the thresholds the same way the engine indexed the
        // married comparator (yearData.irmaaSurcharge); without it the single
        // side priced against flat 2026 tiers and inflated later-year penalties.
        ? calculateIRMAA({ magi: widowMagi, filingStatus: 'single', year: yearData.year })
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
