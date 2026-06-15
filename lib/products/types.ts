/**
 * Custom Product types — user-created product presets via AI Builder or manual entry.
 *
 * Custom products PLUG INTO the existing calculation engine via `engine_preset`,
 * which must be one of the 9 system FormulaType values. The engine dispatch
 * (Growth FIA vs Guaranteed Income) and core calculation paths are unchanged;
 * custom products override only the form-default parameters.
 */

import type { FormulaType } from "@/lib/config/products";

// ---------------------------------------------------------------------------
// Spec-defined archetypes (used for AI mapping + UI grouping)
// ---------------------------------------------------------------------------

export type GrowthArchetype =
  | "growth-vesting"
  | "growth-phased"
  | "growth-immediate"
  | "growth-no-bonus";

export type IncomeArchetype =
  | "income-simple-both"
  | "income-simple-base"
  | "income-compound-flat"
  | "income-compound-split";

export type ProductArchetype = GrowthArchetype | IncomeArchetype;

// Maps spec archetypes → existing system FormulaType engine preset
export const ARCHETYPE_TO_ENGINE_PRESET: Record<ProductArchetype, FormulaType> = {
  "growth-vesting": "vesting-bonus-growth",
  "growth-phased": "phased-bonus-growth",
  "growth-immediate": "high-bonus-long-term-growth",
  "growth-no-bonus": "short-term-cap-growth",
  "income-simple-both": "simple-rollup-income",
  "income-simple-base": "simple-rollup-income",
  "income-compound-flat": "flat-rate-compound-income",
  "income-compound-split": "compound-rollup-income",
};

export const ARCHETYPE_LABELS: Record<ProductArchetype, string> = {
  "growth-vesting": "Vesting Bonus Growth",
  "growth-phased": "Phased Bonus Growth",
  "growth-immediate": "Immediate Bonus Growth",
  "growth-no-bonus": "No Bonus Growth",
  "income-simple-both": "Simple Roll-up (Bonus on Both)",
  "income-simple-base": "Simple Roll-up (Bonus on Income Base)",
  "income-compound-flat": "Compound Roll-up (Flat Rate)",
  "income-compound-split": "Compound Roll-up (Split Rate)",
};

// ---------------------------------------------------------------------------
// Modifier flags
// ---------------------------------------------------------------------------

export type ModifierFlag =
  | "has_annual_fee"
  | "has_return_of_premium"
  | "has_enhanced_income"
  | "has_cumulative_withdrawal"
  | "has_mva";

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "verified" | "assumed" | "not_found" | "partial";

// ---------------------------------------------------------------------------
// Config payload (stored as JSONB in custom_products.config)
// ---------------------------------------------------------------------------

export interface BonusConfig {
  percentage: number;
  type: "vesting" | "immediate" | "phased" | "none";
  vesting_years?: number | null;
  vesting_schedule?: "linear" | number[] | null;
  anniversary_rate?: number | null;
  anniversary_years?: number | null;
  applies_to?: "both" | "income_base" | "account_value" | null;
  confidence?: ConfidenceLevel;
}

export interface SurrenderConfig {
  years: number;
  schedule: number[]; // length === years (charge % per year)
  confidence?: ConfidenceLevel;
}

export interface FeesConfig {
  annual_rider_fee: number;
  fee_duration: "surrender_period" | "lifetime" | number;
  confidence?: ConfidenceLevel;
}

export interface WithdrawalsConfig {
  penalty_free_percent: number;
  year_1_rule: "same" | "interest_only" | "custom";
  year_1_custom_percent?: number | null;
  cumulative_withdrawal: boolean;
  cumulative_percent?: number | null;
  confidence?: ConfidenceLevel;
}

export interface PayoutFactorsByAge {
  [age: string]: number;
}

export interface IncomeConfig {
  roll_up_type: "simple" | "compound";
  roll_up_rate: number;
  roll_up_split_rate: boolean;
  roll_up_rate_years_1_5?: number | null;
  roll_up_rate_years_6_10?: number | null;
  roll_up_max_years: number;
  /**
   * Performance-linked roll-up. When set (non-null), the income base grows by
   * this multiple of the credited interest rate each year — e.g. 1.5 = 150% of
   * credited interest (Allianz 222+), 2.0 = 200% (Athene Agility 10). Overrides
   * roll_up_rate / roll_up_split_rate. When null/absent, the fixed simple or
   * compound roll-up behaves exactly as before.
   */
  roll_up_interest_multiple?: number | null;
  bonus_applies_to?: "both" | "income_base" | "account_value" | null;
  payout_factors: {
    single: PayoutFactorsByAge;
    joint: PayoutFactorsByAge;
  };
  payout_increment_per_year?: number;
  enhanced_income?: {
    included: boolean;
    multiplier_single: number;
    multiplier_joint: number;
    max_years: number;
    waiting_period: number;
  } | null;
  confidence?: ConfidenceLevel;
}

export interface OtherConfig {
  mva_applies: boolean;
  return_of_premium_year?: number | null;
  min_premium?: number | null;
  max_premium?: number | null;
  min_issue_age?: number | null;
  max_issue_age?: number | null;
  confidence?: ConfidenceLevel;
}

export interface StateAvailabilityConfig {
  not_available: string[];
  bonus_overrides: Record<string, number>;          // state code → bonus %
  age_overrides: Record<string, number>;            // state code → max issue age
  mva_overrides?: Record<string, boolean>;          // state code → MVA applies
  surrender_overrides?: Record<string, number[]>;   // state code → surrender schedule array
  vesting_overrides?: Record<string, number[]>;     // state code → vesting % array
  min_premium_overrides?: Record<string, number>;   // state code → min premium $
  confidence?: ConfidenceLevel;
}

export interface ProductConfigPayload {
  bonus: BonusConfig;
  surrender: SurrenderConfig;
  fees: FeesConfig;
  withdrawals: WithdrawalsConfig;
  income?: IncomeConfig | null;
  other: OtherConfig;
  state_availability?: StateAvailabilityConfig | null;
  // Form-default convenience copy (mirrors engine input fields)
  form_defaults?: {
    rate_of_return?: number;
  } | null;
}

// ---------------------------------------------------------------------------
// AI metadata
// ---------------------------------------------------------------------------

export interface AISource {
  url: string;
  type: "official" | "third_party" | "uploaded_document";
}

export interface AIWarning {
  field: string;
  message: string;
  resolution: "assumed" | "not_found" | "ambiguous";
}

export interface UnsupportedFeature {
  feature: string;
  description: string;
  approach: string;
  impact: "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Database row shape
// ---------------------------------------------------------------------------

export interface CustomProductRow {
  id: string;
  user_id: string;
  name: string;
  carrier_name: string | null;
  carrier_product_name: string | null;
  category: "growth" | "income";
  archetype: ProductArchetype;
  engine_preset: FormulaType;
  modifier_flags: ModifierFlag[];
  config: ProductConfigPayload;
  source: "manual" | "ai_research" | "ai_document" | "duplicated_from_preset" | "adopted_from_community";
  community_product_id: string | null; // set when this copy was adopted from the Community catalog
  ai_research_sources: AISource[] | null;
  ai_warnings: AIWarning[] | null;
  ai_unsupported_features: UnsupportedFeature[] | null;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Community Products — platform-curated catalog (read-only to advisors).
// Adopting one copies it into the advisor's custom_products.
// ---------------------------------------------------------------------------

export interface CommunityProductRow {
  id: string;
  name: string;
  description: string | null;
  carrier_name: string | null;
  carrier_product_name: string | null;
  category: "growth" | "income";
  archetype: ProductArchetype;
  engine_preset: FormulaType;
  modifier_flags: ModifierFlag[];
  config: ProductConfigPayload;
  source_custom_product_id: string | null;
  created_by: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API input shapes
// ---------------------------------------------------------------------------

export interface CreateCustomProductInput {
  name: string;
  carrier_name?: string | null;
  carrier_product_name?: string | null;
  category: "growth" | "income";
  archetype: ProductArchetype;
  engine_preset?: FormulaType; // optional — defaults from archetype map
  modifier_flags?: ModifierFlag[];
  config: ProductConfigPayload;
  source?: "manual" | "ai_research" | "ai_document" | "duplicated_from_preset" | "adopted_from_community";
  ai_research_sources?: AISource[] | null;
  ai_warnings?: AIWarning[] | null;
  ai_unsupported_features?: UnsupportedFeature[] | null;
}

export type UpdateCustomProductInput = Partial<
  Omit<CreateCustomProductInput, "category">
> & {
  is_favorite?: boolean;
  is_archived?: boolean;
};

// ---------------------------------------------------------------------------
// Combined product list shape (system + custom) for UI dropdowns
// ---------------------------------------------------------------------------

export interface ProductListItem {
  id: string; // FormulaType for system, UUID for custom
  name: string; // Display label
  category: "growth" | "income";
  isSystem: boolean;
  isFavorite: boolean;
  archetype?: ProductArchetype | null;
  engine_preset: FormulaType;
}
