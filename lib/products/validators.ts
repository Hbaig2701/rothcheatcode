/**
 * Zod validators for custom_products API.
 */

import { z } from "zod";

const archetypeEnum = z.enum([
  "growth-vesting",
  "growth-phased",
  "growth-immediate",
  "growth-no-bonus",
  "income-simple-both",
  "income-simple-base",
  "income-compound-flat",
  "income-compound-split",
]);

const enginePresetEnum = z.enum([
  "fia",
  "short-term-cap-growth",
  "phased-bonus-growth",
  "vesting-bonus-growth",
  "high-bonus-long-term-growth",
  "high-bonus-medium-term-growth",
  "simple-rollup-income",
  "compound-rollup-income",
  "flat-rate-compound-income",
  "generic-income",
]);

const modifierFlagEnum = z.enum([
  "has_annual_fee",
  "has_return_of_premium",
  "has_enhanced_income",
  "has_cumulative_withdrawal",
  "has_mva",
]);

const confidenceEnum = z.enum(["verified", "assumed", "not_found", "partial"]).optional();

const bonusSchema = z.object({
  percentage: z.number().min(0).max(100),
  type: z.enum(["vesting", "immediate", "phased", "none"]),
  vesting_years: z.number().int().min(0).max(30).nullable().optional(),
  vesting_schedule: z.union([z.literal("linear"), z.array(z.number().min(0).max(100))]).nullable().optional(),
  anniversary_rate: z.number().min(0).max(50).nullable().optional(),
  anniversary_years: z.number().int().min(0).max(20).nullable().optional(),
  applies_to: z.enum(["both", "income_base", "account_value"]).nullable().optional(),
  confidence: confidenceEnum,
});

const surrenderSchema = z.object({
  years: z.number().int().min(0).max(30),
  schedule: z.array(z.number().min(0).max(100)),
  confidence: confidenceEnum,
}).refine((s) => s.schedule.length === s.years, {
  message: "surrender.schedule length must equal surrender.years",
  path: ["schedule"],
});

const feesSchema = z.object({
  annual_rider_fee: z.number().min(0).max(10),
  fee_duration: z.union([z.literal("surrender_period"), z.literal("lifetime"), z.number().int().min(0).max(30)]),
  confidence: confidenceEnum,
});

const withdrawalsSchema = z.object({
  penalty_free_percent: z.number().min(0).max(100),
  year_1_rule: z.enum(["same", "interest_only", "custom"]),
  year_1_custom_percent: z.number().min(0).max(100).nullable().optional(),
  cumulative_withdrawal: z.boolean(),
  cumulative_percent: z.number().min(0).max(100).nullable().optional(),
  confidence: confidenceEnum,
});

const payoutByAgeSchema = z.record(z.string(), z.number().min(0).max(30));

const incomeSchema = z.object({
  roll_up_type: z.enum(["simple", "compound"]),
  roll_up_rate: z.number().min(0).max(20),
  roll_up_split_rate: z.boolean(),
  roll_up_rate_years_1_5: z.number().min(0).max(20).nullable().optional(),
  roll_up_rate_years_6_10: z.number().min(0).max(20).nullable().optional(),
  roll_up_max_years: z.number().int().min(0).max(30),
  // Performance-linked roll-up multiplier (e.g. 1.5 = 150% of credited interest).
  // When present, supersedes the fixed roll_up_rate. Capped at 5x defensively.
  roll_up_interest_multiple: z.number().min(0).max(5).nullable().optional(),
  bonus_applies_to: z.enum(["both", "income_base", "account_value"]).nullable().optional(),
  payout_factors: z.object({
    single: payoutByAgeSchema,
    joint: payoutByAgeSchema,
  }),
  payout_increment_per_year: z.number().min(0).max(2).optional(),
  enhanced_income: z.object({
    included: z.boolean(),
    multiplier_single: z.number().min(1).max(5),
    multiplier_joint: z.number().min(1).max(5),
    max_years: z.number().int().min(0).max(20),
    waiting_period: z.number().int().min(0).max(20),
  }).nullable().optional(),
  confidence: confidenceEnum,
});

const otherSchema = z.object({
  mva_applies: z.boolean(),
  return_of_premium_year: z.number().int().min(0).max(30).nullable().optional(),
  min_premium: z.number().min(0).nullable().optional(),
  max_premium: z.number().min(0).nullable().optional(),
  min_issue_age: z.number().int().min(0).max(120).nullable().optional(),
  max_issue_age: z.number().int().min(0).max(120).nullable().optional(),
  confidence: confidenceEnum,
});

const stateAvailabilitySchema = z.object({
  not_available: z.array(z.string().length(2)),
  bonus_overrides: z.record(z.string(), z.number().min(0).max(100)),
  age_overrides: z.record(z.string(), z.number().int().min(0).max(120)),
  mva_overrides: z.record(z.string(), z.boolean()).optional(),
  surrender_overrides: z.record(z.string(), z.array(z.number().min(0).max(100))).optional(),
  vesting_overrides: z.record(z.string(), z.array(z.number().min(0).max(100))).optional(),
  min_premium_overrides: z.record(z.string(), z.number().min(0)).optional(),
  confidence: confidenceEnum,
}).nullable().optional();

export const productConfigSchema = z.object({
  bonus: bonusSchema,
  surrender: surrenderSchema,
  fees: feesSchema,
  withdrawals: withdrawalsSchema,
  income: incomeSchema.nullable().optional(),
  other: otherSchema,
  state_availability: stateAvailabilitySchema,
  form_defaults: z.object({
    rate_of_return: z.number().min(0).max(30).optional(),
  }).nullable().optional(),
});

export const aiSourceSchema = z.object({
  url: z.string(),
  type: z.enum(["official", "third_party", "uploaded_document"]),
});

export const aiWarningSchema = z.object({
  field: z.string(),
  message: z.string(),
  resolution: z.enum(["assumed", "not_found", "ambiguous"]),
});

export const unsupportedFeatureSchema = z.object({
  feature: z.string(),
  description: z.string(),
  approach: z.string(),
  impact: z.enum(["low", "medium", "high"]),
});

// Base object schema (no refinements — needed for .partial() in update flow)
const customProductBaseObject = z.object({
  name: z.string().min(1, "Name required").max(100),
  carrier_name: z.string().max(100).nullable().optional(),
  carrier_product_name: z.string().max(150).nullable().optional(),
  category: z.enum(["growth", "income"]),
  archetype: archetypeEnum,
  engine_preset: enginePresetEnum.optional(),
  modifier_flags: z.array(modifierFlagEnum).optional().default([]),
  config: productConfigSchema,
  source: z.enum(["manual", "ai_research", "ai_document", "duplicated_from_preset", "adopted_from_community"]).optional().default("manual"),
  ai_research_sources: z.array(aiSourceSchema).nullable().optional(),
  ai_warnings: z.array(aiWarningSchema).nullable().optional(),
  ai_unsupported_features: z.array(unsupportedFeatureSchema).nullable().optional(),
});

export const createCustomProductSchema = customProductBaseObject.refine((d) => {
  const isGrowth = d.archetype.startsWith("growth-");
  return (isGrowth && d.category === "growth") || (!isGrowth && d.category === "income");
}, {
  message: "archetype must match category (growth-* with category=growth, income-* with category=income)",
  path: ["archetype"],
});

export const updateCustomProductSchema = customProductBaseObject.partial().extend({
  is_favorite: z.boolean().optional(),
  is_archived: z.boolean().optional(),
});

export type CreateCustomProductBody = z.infer<typeof createCustomProductSchema>;
export type UpdateCustomProductBody = z.infer<typeof updateCustomProductSchema>;
