/**
 * Helpers for translating between custom product config payloads and the
 * client form fields the calculation engine consumes.
 */

import type {
  ProductConfigPayload,
  ProductArchetype,
  ModifierFlag,
} from "@/lib/products/types";
import { ARCHETYPE_TO_ENGINE_PRESET } from "@/lib/products/types";
import type { FormulaType } from "@/lib/config/products";

/** Default empty config for a Growth product (manual builder starting point) */
export function defaultGrowthConfig(archetype: ProductArchetype = "growth-vesting"): ProductConfigPayload {
  const isVesting = archetype === "growth-vesting";
  const isPhased = archetype === "growth-phased";
  const isImmediate = archetype === "growth-immediate";

  return {
    bonus: {
      percentage: isImmediate ? 22 : isPhased ? 8 : isVesting ? 14 : 0,
      type: isImmediate ? "immediate" : isPhased ? "phased" : isVesting ? "vesting" : "none",
      vesting_years: isVesting ? 10 : null,
      vesting_schedule: isVesting ? "linear" : null,
      anniversary_rate: isPhased ? 4 : null,
      anniversary_years: isPhased ? 3 : null,
      applies_to: null,
    },
    surrender: {
      years: isImmediate ? 15 : 10,
      schedule: isImmediate
        ? [15, 14, 14, 13, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 0]
        : [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    },
    fees: {
      annual_rider_fee: isImmediate ? 0.95 : 0,
      fee_duration: "surrender_period",
    },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: "same",
      year_1_custom_percent: null,
      cumulative_withdrawal: false,
      cumulative_percent: null,
    },
    other: {
      mva_applies: false,
      return_of_premium_year: null,
    },
    form_defaults: {
      rate_of_return: 7,
    },
  };
}

/** Default empty config for an Income product */
export function defaultIncomeConfig(archetype: ProductArchetype = "income-simple-both"): ProductConfigPayload {
  const isCompoundFlat = archetype === "income-compound-flat";
  const isCompoundSplit = archetype === "income-compound-split";
  const isSimpleBoth = archetype === "income-simple-both";

  return {
    bonus: {
      percentage: isCompoundSplit ? 20 : isSimpleBoth ? 14 : 0,
      type: "immediate",
      applies_to: isSimpleBoth ? "both" : isCompoundSplit ? "income_base" : null,
    },
    surrender: {
      years: 10,
      schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    },
    fees: {
      annual_rider_fee: isCompoundFlat ? 1.15 : isCompoundSplit ? 1.25 : 1.2,
      fee_duration: "lifetime",
    },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: "same",
      year_1_custom_percent: null,
      cumulative_withdrawal: false,
      cumulative_percent: null,
    },
    income: {
      roll_up_type: isCompoundFlat || isCompoundSplit ? "compound" : "simple",
      roll_up_rate: isCompoundFlat ? 8 : isCompoundSplit ? 7 : 8.25,
      roll_up_split_rate: isCompoundSplit,
      roll_up_rate_years_1_5: isCompoundSplit ? 7 : null,
      roll_up_rate_years_6_10: isCompoundSplit ? 4 : null,
      roll_up_max_years: 10,
      bonus_applies_to: isSimpleBoth ? "both" : isCompoundSplit ? "income_base" : null,
      payout_factors: defaultPayoutFactors(),
      payout_increment_per_year: 0.1,
    },
    other: {
      mva_applies: false,
    },
    form_defaults: {
      rate_of_return: 0,
    },
  };
}

function defaultPayoutFactors() {
  const single: Record<string, number> = {};
  const joint: Record<string, number> = {};
  for (let age = 55; age <= 80; age++) {
    single[String(age)] = 5.6 + (age - 55) * 0.1;
    joint[String(age)] = 4.6 + (age - 55) * 0.1;
  }
  return { single, joint };
}

export function getEnginePreset(archetype: ProductArchetype): FormulaType {
  return ARCHETYPE_TO_ENGINE_PRESET[archetype];
}

export function inferModifierFlags(config: ProductConfigPayload): ModifierFlag[] {
  const flags: ModifierFlag[] = [];
  if (config.fees.annual_rider_fee > 0) flags.push("has_annual_fee");
  if (config.other.return_of_premium_year != null) flags.push("has_return_of_premium");
  if (config.other.mva_applies) flags.push("has_mva");
  if (config.withdrawals.cumulative_withdrawal) flags.push("has_cumulative_withdrawal");
  if (config.income?.enhanced_income?.included) flags.push("has_enhanced_income");
  return flags;
}
