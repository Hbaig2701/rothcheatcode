/**
 * Product Config Resolver — merges custom product overrides on top of system presets.
 *
 * The engine has historically pulled product-specific data (roll-up rates, payout
 * factor tables, rider fees, bonus targeting) directly from the system preset
 * tables (ALL_PRODUCTS, GI_PRODUCT_DATA), keyed by client.blueprint_type. Custom
 * products were a UI convenience — they pre-filled form fields but the engine's
 * deeper config remained the system preset's.
 *
 * That meant a custom GI product could only differ from its parent preset by
 * `bonus_percent` and surrender schedule — its custom roll-up rate, payout
 * factors, rider fee, and bonus targeting were silently ignored.
 *
 * This resolver fixes that. It takes the system preset as the base and overlays
 * any fields the custom product specifies. Engine code calls these getters
 * instead of reading the system tables directly.
 */
import {
  GI_PRODUCT_DATA,
  type GIProductData,
  type PayoutByAge,
  type StandardPayoutTable,
  type DualPayoutTable,
  type RollUpConfig,
} from "@/lib/config/gi-product-data";
import { ALL_PRODUCTS, type FormulaType, type GuaranteedIncomeFormulaType } from "@/lib/config/products";
import type { CustomProductRow } from "@/lib/products/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a custom-config string-keyed payout table to the engine's number-keyed shape. */
function normalizePayoutByAge(table: Record<string, number> | undefined): PayoutByAge | null {
  if (!table) return null;
  const entries = Object.entries(table);
  if (entries.length === 0) return null;
  const out: PayoutByAge = {};
  for (const [age, pct] of entries) {
    const n = Number(age);
    if (!Number.isFinite(n)) continue;
    out[n] = pct;
  }
  return out;
}

/** Convert custom config's snake_case bonus target to the engine's camelCase. */
type CustomBonusTarget = "both" | "income_base" | "account_value" | null | undefined;
function mapBonusAppliesTo(v: CustomBonusTarget): "both" | "incomeBase" | "accountValue" | null {
  if (v === "both") return "both";
  if (v === "income_base") return "incomeBase";
  if (v === "account_value") return "accountValue";
  return null;
}

// ---------------------------------------------------------------------------
// GI: Effective product data (used for all GI engine reads)
// ---------------------------------------------------------------------------

/**
 * Resolve the GIProductData the engine should use for this client. If a custom
 * product is attached, its config overlays the system preset's data. Fields the
 * custom product doesn't specify fall through to the system preset.
 */
export function getEffectiveGIData(
  productId: GuaranteedIncomeFormulaType,
  customProduct?: CustomProductRow | null
): GIProductData | undefined {
  const base = GI_PRODUCT_DATA[productId];
  if (!base || !customProduct || !customProduct.config) return base;

  const cfg = customProduct.config;
  const incomeCfg = cfg.income ?? null;

  // -- bonusAppliesTo --
  // Income config's `bonus_applies_to` wins; otherwise check the bonus block;
  // otherwise fall back to system preset.
  let bonusAppliesTo: GIProductData["bonusAppliesTo"] = base.bonusAppliesTo;
  const incomeBonusTarget = incomeCfg?.bonus_applies_to ?? null;
  const bonusTarget = cfg.bonus.applies_to ?? null;
  if (incomeBonusTarget) {
    bonusAppliesTo = mapBonusAppliesTo(incomeBonusTarget);
  } else if (bonusTarget) {
    bonusAppliesTo = mapBonusAppliesTo(bonusTarget);
  }

  // -- riderFee --
  // The custom config has `fees.annual_rider_fee` as a percentage (e.g. 1.25 for 1.25%).
  // Use it whenever the custom product was created with a non-null fee. We don't have a
  // sentinel for "fall back to system" — if the advisor didn't enter a fee, they got 0,
  // and that's their explicit override.
  const riderFee = cfg.fees.annual_rider_fee;

  // -- riderFeeAppliesTo --
  // Custom config doesn't expose this today; keep system preset's choice.
  const riderFeeAppliesTo = base.riderFeeAppliesTo;

  // -- rollUp --
  let rollUp: RollUpConfig = base.rollUp;
  if (incomeCfg) {
    if (incomeCfg.roll_up_split_rate) {
      // Tiered: years 1-5 and 6-10. We model this exactly like the system
      // 'compound-rollup-income' preset's tiered config.
      const tier1 = incomeCfg.roll_up_rate_years_1_5 ?? incomeCfg.roll_up_rate;
      const tier2 = incomeCfg.roll_up_rate_years_6_10 ?? incomeCfg.roll_up_rate;
      rollUp = {
        type: incomeCfg.roll_up_type,
        rates: [
          { years: [1, 5], rate: tier1 },
          { years: [6, Math.min(10, incomeCfg.roll_up_max_years)], rate: tier2 },
        ],
        maxPeriod: incomeCfg.roll_up_max_years,
      };
    } else {
      rollUp = {
        type: incomeCfg.roll_up_type,
        rate: incomeCfg.roll_up_rate,
        maxPeriod: incomeCfg.roll_up_max_years,
      };
    }
  }

  // -- payoutTable --
  // If custom payout_factors are non-empty, swap them in. Dual-payout products
  // get the custom table mapped to BOTH 'level' and 'increasing' (a limitation —
  // custom config doesn't differentiate today). Standard-payout products get
  // the custom table directly.
  let payoutTable: StandardPayoutTable | DualPayoutTable = base.payoutTable;
  if (incomeCfg?.payout_factors) {
    const customSingle = normalizePayoutByAge(incomeCfg.payout_factors.single);
    const customJoint = normalizePayoutByAge(incomeCfg.payout_factors.joint);
    if (customSingle || customJoint) {
      // Pull existing fallback tables out of base for any age the custom misses
      const baseStandard = base.hasDualPayoutOption
        ? (base.payoutTable as DualPayoutTable).level
        : (base.payoutTable as StandardPayoutTable);
      const newSingle: PayoutByAge = { ...baseStandard.single, ...(customSingle ?? {}) };
      const newJoint: PayoutByAge = { ...baseStandard.joint, ...(customJoint ?? {}) };
      const newStandard: StandardPayoutTable = { single: newSingle, joint: newJoint };
      if (base.hasDualPayoutOption) {
        // Use custom for level; keep system's increasing (no place in config to override)
        payoutTable = {
          level: newStandard,
          increasing: (base.payoutTable as DualPayoutTable).increasing,
        };
      } else {
        payoutTable = newStandard;
      }
    }
  }

  // -- rollUpDescription (cosmetic but used in metrics) --
  let rollUpDescription = base.rollUpDescription;
  if (incomeCfg) {
    if (incomeCfg.roll_up_split_rate) {
      rollUpDescription = `${incomeCfg.roll_up_rate_years_1_5 ?? incomeCfg.roll_up_rate}% ${incomeCfg.roll_up_type} (yrs 1-5), ${incomeCfg.roll_up_rate_years_6_10 ?? incomeCfg.roll_up_rate}% ${incomeCfg.roll_up_type} (yrs 6-${Math.min(10, incomeCfg.roll_up_max_years)})`;
    } else {
      rollUpDescription = `${incomeCfg.roll_up_rate}% ${incomeCfg.roll_up_type === "simple" ? "Simple Interest" : "Compound"} (${incomeCfg.roll_up_max_years}yr max)`;
    }
  }

  return {
    ...base,
    bonusAppliesTo,
    riderFee,
    riderFeeAppliesTo,
    rollUp,
    payoutTable,
    rollUpDescription,
    // hasDualPayoutOption + hasRollUpOptions stay tied to the system preset's
    // structure — they govern UI affordances, not numeric overrides.
  };
}

// ---------------------------------------------------------------------------
// GI: Roll-up lookup (replaces getRollUpForYear from gi-product-data.ts)
// ---------------------------------------------------------------------------

export function getEffectiveRollUpForYear(
  productId: GuaranteedIncomeFormulaType,
  deferralYear: number,
  rollUpOption: "simple" | "compound" | null = null,
  customProduct?: CustomProductRow | null
): { rate: number; type: "simple" | "compound"; maxPeriod: number } | null {
  const data = getEffectiveGIData(productId, customProduct);
  if (!data) return null;
  const config = data.rollUp;

  // User-selectable options (system preset path — custom products don't
  // currently expose option selection, so this branch is effectively
  // system-preset-only)
  if (config.options) {
    const selectedId = rollUpOption ?? config.defaultOption ?? config.options[0].id;
    const selected = config.options.find((o) => o.id === selectedId) ?? config.options[0];
    if (deferralYear > selected.maxPeriod) return null;
    return { rate: selected.rate / 100, type: selected.type, maxPeriod: selected.maxPeriod };
  }

  if (deferralYear > config.maxPeriod) return null;

  // Tiered rates
  if (config.rates) {
    const tier = config.rates.find((r) => deferralYear >= r.years[0] && deferralYear <= r.years[1]);
    if (!tier) return null;
    return { rate: tier.rate / 100, type: config.type ?? "compound", maxPeriod: config.maxPeriod };
  }

  // Single rate
  if (config.rate !== undefined) {
    return { rate: config.rate / 100, type: config.type ?? "simple", maxPeriod: config.maxPeriod };
  }

  return null;
}

// ---------------------------------------------------------------------------
// GI: Payout factor lookup (replaces getProductPayoutFactor)
// ---------------------------------------------------------------------------

export function getEffectivePayoutFactor(
  productId: GuaranteedIncomeFormulaType,
  payoutType: "individual" | "joint",
  age: number,
  payoutOption: "level" | "increasing" = "level",
  customProduct?: CustomProductRow | null
): number {
  const data = getEffectiveGIData(productId, customProduct);
  if (!data) return 0.05;

  const tableKey = payoutType === "individual" ? "single" : "joint";

  if (data.hasDualPayoutOption) {
    const dualTable = data.payoutTable as DualPayoutTable;
    const optionTable = dualTable[payoutOption];
    const clampedAge = Math.min(Math.max(age, 50), 80);
    return (optionTable[tableKey][clampedAge] ?? 5.0) / 100;
  }

  const standardTable = data.payoutTable as StandardPayoutTable;
  const minAge = 50 in standardTable.single ? 50 : 55;
  const clampedAge = Math.min(Math.max(age, minAge), 80);
  return (standardTable[tableKey][clampedAge] ?? 5.0) / 100;
}

// ---------------------------------------------------------------------------
// GI: Increasing LPA rate (replaces getIncreasingLPARate)
// ---------------------------------------------------------------------------

export function getEffectiveIncreasingLPARate(
  productId: GuaranteedIncomeFormulaType,
  customProduct?: CustomProductRow | null
): number {
  // Custom config has no field for this; keep system value.
  void customProduct;
  const product = GI_PRODUCT_DATA[productId];
  return (product?.increasingLPARate ?? 0) / 100;
}

// ---------------------------------------------------------------------------
// Growth: Effective rider fee
// ---------------------------------------------------------------------------

/**
 * Returns the rider fee percentage (as a decimal, e.g. 0.0095 for 0.95%) for
 * growth products. Custom products override the system preset's value.
 */
export function getEffectiveGrowthRiderFee(
  formulaType: FormulaType,
  customProduct?: CustomProductRow | null
): number {
  if (customProduct?.config?.fees) {
    return customProduct.config.fees.annual_rider_fee / 100;
  }
  const productConfig = ALL_PRODUCTS[formulaType];
  return (productConfig?.defaults.riderFee ?? 0) / 100;
}
