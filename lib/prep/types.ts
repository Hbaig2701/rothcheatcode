import type { Client } from '@/lib/types/client';
import type { YearlyResult } from '@/lib/calculations/types';

/**
 * Pre-Meeting Prep — the advisor-only brief generated from a finished
 * projection. See lib/prep/compute.ts for the architectural rule that keeps it
 * accurate: it READS the projection, it never recomputes anything.
 */

/** Every number the brief can show, pulled straight from the projection. */
export interface PrepFacts {
  // who
  name: string;
  /** First name, used throughout the copy so it never has to guess a pronoun. */
  firstName: string;
  age: number;
  spouseAge: number | null;
  filing: string;
  state: string;
  endAge: number;
  isMarried: boolean;

  // money in
  ira: number;
  roth: number;
  taxable: number;

  // the plan
  conversionType: string;
  bracketCeiling: number | null;
  taxFromIra: boolean;
  productName: string | null;
  isNoAnnuity: boolean;

  // headline
  baselineNetLegacy: number;
  strategyNetLegacy: number;
  legacyGain: number;
  legacyGainPct: number;

  // what it costs
  conversionTaxTotal: number;
  conversionYears: number;
  conversionFirstAge: number | null;
  conversionLastAge: number | null;
  worstYearTax: number;
  worstYearAge: number | null;
  /** Tax-payback break-even: when cumulative TAX paid falls below the do-nothing side. */
  taxPaybackAge: number | null;
  /**
   * Age at which the strategy's net legacy overtakes doing nothing, read off
   * the same series the wealth chart plots. This — not tax payback — is the
   * honest answer to "what if I die early", because it is the number the
   * client's family actually receives. null = it never overtakes.
   */
  legacyCrossoverAge: number | null;
  /**
   * Age from which the strategy falls behind and never recovers — the mirror
   * of legacyCrossoverAge, for plans that start ahead and end behind. Exactly
   * one of these two is non-null.
   */
  legacyFallsBehindAge: number | null;
  /** True when the strategy's net legacy is ahead at the end of the plan. */
  aheadAtEnd: boolean;

  // doing nothing
  firstRmdAge: number | null;
  firstRmdAmount: number;
  peakRmdAmount: number;
  peakRmdAge: number | null;
  baselineLifetimeTax: number;
  strategyLifetimeTax: number;
  lifetimeTaxSaved: number;
  heirRatePct: number;
  baselineFinalTraditional: number;
  baselineHeirTax: number;

  // medicare
  baselineIrmaaTotal: number;
  strategyIrmaaTotal: number;
  baselineWorstTier: number;
  strategyWorstTier: number;

  // timing
  yearsOfRunway: number;
  alreadyPastRmdAge: boolean;
  iraFullyConvertedByAge: number | null;
  strategyFinalTraditional: number;

  // widow (null when not analysed)
  widowExtraTax: number | null;
}

export type WarningTone = 'watch' | 'check';

/** One "watch out for this" item. `say` is the advisor's actual words. */
export interface PrepWarning {
  id: string;
  tone: WarningTone;
  headline: string;
  detail: string;
  say?: string;
}

export type PrepResult =
  | { supported: true; sheet: PrepSheet }
  | { supported: false; reason: string };

export interface PrepSheet {
  facts: PrepFacts;
  warnings: PrepWarning[];
  generatedAt: string;
}

export interface PrepInput {
  client: Client;
  /** Which engine produced these rows — the brief only reads growth/standard shapes. */
  engine: 'growth' | 'standard' | 'gi';
  baseline: YearlyResult[];
  formula: YearlyResult[];
  taxPaybackAge: number | null;
  /** { age, baseline, formula } net-legacy series — straight from transformToChartData. */
  legacySeries: { age: number; baseline: number; formula: number }[];
  widowExtraTax?: number | null;
}
