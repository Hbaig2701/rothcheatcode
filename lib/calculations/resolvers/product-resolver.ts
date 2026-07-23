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
  // Guard against a config missing the fees block (older rows / direct seeds /
  // partial AI extractions) — `cfg.fees.annual_rider_fee` on an undefined
  // `fees` would throw, and `undefined` would become NaN in the engine
  // (riderFee/100), silently corrupting every income-base deduction.
  const riderFee = cfg.fees?.annual_rider_fee ?? base.riderFee;

  // -- riderFeeAppliesTo --
  // Custom config doesn't expose this today; keep system preset's choice.
  const riderFeeAppliesTo = base.riderFeeAppliesTo;

  // -- benefitBaseDrawsDown --
  // Opt-in per product: TRUE for withdrawal-benefit FIAs (Allianz 222, Athene
  // Agility) whose benefit base draws down pro-rata on income; FALSE (default)
  // for classic GLWBs with a locked income base. Falls back to the system
  // preset's value, then false.
  const benefitBaseDrawsDown = incomeCfg?.benefit_base_draws_down ?? base.benefitBaseDrawsDown ?? false;

  // -- rollUp --
  let rollUp: RollUpConfig = base.rollUp;
  if (incomeCfg) {
    if (incomeCfg.roll_up_interest_multiple != null) {
      // Performance-linked roll-up (e.g. 150% of credited interest). The income
      // base compounds by `interestMultiple` × the year's credited rate; the
      // effective rate is resolved at lookup time in getEffectiveRollUpForYear.
      rollUp = {
        type: "compound",
        interestMultiple: incomeCfg.roll_up_interest_multiple,
        // Default 'income_base' (compound on the base) preserves every existing
        // product's behavior; only products that opt into 'account_value'
        // (Athene Agility) credit the multiple-of-dollars-to-AV instead.
        creditBasis: incomeCfg.roll_up_credit_basis ?? "income_base",
        maxPeriod: incomeCfg.roll_up_max_years,
      };
    } else if (incomeCfg.roll_up_split_rate) {
      // Tiered: years 1-5 and 6-10. We model this exactly like the system
      // 'compound-rollup-income' preset's tiered config.
      const tier1 = incomeCfg.roll_up_rate_years_1_5 ?? incomeCfg.roll_up_rate;
      const tier2 = incomeCfg.roll_up_rate_years_6_10 ?? incomeCfg.roll_up_rate;
      rollUp = {
        type: incomeCfg.roll_up_type,
        rates: [
          { years: [1, 5], rate: tier1 },
          // Tier 2 runs from year 6 through the product's max roll-up year — NOT
          // a hard-coded 10. Previously capped at 10, so a split-rate product
          // with roll_up_max_years > 10 silently stopped rolling up after year
          // 10 (no tier matched years 11+ → getEffectiveRollUpForYear returned
          // null → income base froze early).
          { years: [6, incomeCfg.roll_up_max_years], rate: tier2 },
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
        // Custom config carries a single payout table — apply it to BOTH level
        // and increasing. Previously 'increasing' fell back to the SYSTEM
        // preset's factors, i.e. a DIFFERENT product's numbers (selecting
        // "increasing" on the Allianz 222 used flat-rate-compound-income's ~8%
        // table instead of the 222's ~6%). The same custom table on both is far
        // closer to reality than an unrelated preset's curve.
        payoutTable = { level: newStandard, increasing: newStandard };
      } else {
        payoutTable = newStandard;
      }
    }
  }

  // -- rollUpDescription (cosmetic but used in metrics) --
  let rollUpDescription = base.rollUpDescription;
  if (incomeCfg) {
    if (incomeCfg.roll_up_interest_multiple != null) {
      rollUpDescription = `${Math.round(incomeCfg.roll_up_interest_multiple * 100)}% of credited interest (${incomeCfg.roll_up_max_years}yr max)`;
    } else if (incomeCfg.roll_up_split_rate) {
      rollUpDescription = `${incomeCfg.roll_up_rate_years_1_5 ?? incomeCfg.roll_up_rate}% ${incomeCfg.roll_up_type} (yrs 1-5), ${incomeCfg.roll_up_rate_years_6_10 ?? incomeCfg.roll_up_rate}% ${incomeCfg.roll_up_type} (yrs 6-${incomeCfg.roll_up_max_years})`;
    } else {
      rollUpDescription = `${incomeCfg.roll_up_rate}% ${incomeCfg.roll_up_type === "simple" ? "Simple Interest" : "Compound"} (${incomeCfg.roll_up_max_years}yr max)`;
    }
  }

  return {
    ...base,
    bonusAppliesTo,
    riderFee,
    riderFeeAppliesTo,
    benefitBaseDrawsDown,
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
  customProduct?: CustomProductRow | null,
  // Year's credited interest rate as a DECIMAL (e.g. 0.06). Only used by
  // performance-linked (interestMultiple) roll-ups; ignored by fixed roll-ups,
  // so existing callers/products are unaffected.
  creditedRate: number = 0
): { rate: number; type: "simple" | "compound"; maxPeriod: number; creditBasis?: "income_base" | "account_value" } | null {
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

  // Performance-linked roll-up: rate = multiplier × this year's credited rate.
  // Already a decimal (creditedRate is a decimal), so no /100 here. Compounds.
  // Floor the credited rate at 0: a fixed index annuity's index credit can
  // never be negative (0% floor), so a negative assumed return must not shrink
  // the guaranteed income base — that year simply earns no roll-up.
  if (config.interestMultiple != null) {
    return {
      rate: config.interestMultiple * Math.max(0, creditedRate),
      type: "compound",
      maxPeriod: config.maxPeriod,
      creditBasis: config.creditBasis ?? "income_base",
    };
  }

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

  // Clamp the lookup age to the actual age range PRESENT in the table — not a
  // hard-coded 50..80. Custom products (e.g. Allianz 222, factors to age 90)
  // were silently clamped to age 80, discarding any factor defined past 80.
  // System presets top out at 80, so their behavior is unchanged.
  const clampToTable = (t: Record<number, number>): number => {
    const ages = Object.keys(t).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    if (ages.length === 0) return 0.05;
    const clampedAge = Math.min(Math.max(age, ages[0]), ages[ages.length - 1]);
    if (t[clampedAge] != null) return t[clampedAge] / 100;
    // Sparse table (in-range age with no explicit entry): fall to the nearest
    // defined age AT OR BELOW the clamped age — payout factors step up by
    // attained-age band — instead of a blanket 5% that silently mis-sizes income.
    let best = ages[0];
    for (const a of ages) {
      if (a <= clampedAge) best = a;
      else break;
    }
    return t[best] / 100;
  };

  if (data.hasDualPayoutOption) {
    const dualTable = data.payoutTable as DualPayoutTable;
    return clampToTable(dualTable[payoutOption][tableKey]);
  }

  const standardTable = data.payoutTable as StandardPayoutTable;
  return clampToTable(standardTable[tableKey]);
}

// ---------------------------------------------------------------------------
// GI: Increasing LPA rate (replaces getIncreasingLPARate)
// ---------------------------------------------------------------------------

export function getEffectiveIncreasingIncomeRate(
  productId: GuaranteedIncomeFormulaType,
  customProduct: CustomProductRow | null | undefined,
  creditedRate: number,
): number {
  // How the "increasing" LPA grows each year:
  //  - 'credited_rate' (Allianz 222, Athene Agility): the income steps up by the
  //    assumed crediting rate, floored at 0% — so a 0%-credit year keeps income
  //    flat. This is the carrier's index-linked increasing-income mechanic and
  //    matches the illustrations; the flat preset rate understated it.
  //  - 'fixed' (default / legacy): the engine preset's flat increasingLPARate
  //    (~2%). Existing products keep this unless they opt in, so nothing else
  //    changes.
  const basis =
    customProduct?.config?.income?.increasing_income_basis
    ?? GI_PRODUCT_DATA[productId]?.increasingIncomeBasis
    ?? "fixed";
  if (basis === "credited_rate") return Math.max(0, creditedRate);
  return (GI_PRODUCT_DATA[productId]?.increasingLPARate ?? 0) / 100;
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
  // Guard the numeric fee, not just the presence of a `fees` block: older rows,
  // direct seeds, and partial AI extractions can carry a `fees` object with no
  // `annual_rider_fee`, and `undefined / 100 = NaN` would silently NaN-poison
  // every downstream balance. Mirrors the GI path's guard.
  const fee = customProduct?.config?.fees?.annual_rider_fee;
  if (fee != null && Number.isFinite(fee)) {
    return fee / 100;
  }
  const productConfig = ALL_PRODUCTS[formulaType];
  return (productConfig?.defaults.riderFee ?? 0) / 100;
}

/**
 * Cumulative (accumulating) free-withdrawal rule for growth products.
 *
 * Some carriers let an unused free-withdrawal allowance carry forward — e.g.
 * Athene Performance Elite: 10% in year 1, and if you skip year 1 you may take
 * 20% in year 2. The product config carries this as
 * `withdrawals.cumulative_withdrawal` (bool) + `cumulative_percent` (the ceiling
 * on any single year's allowance, e.g. 20). Only custom/community products carry
 * this config; system presets have no cumulative rule, so an absent/false config
 * returns { enabled: false }.
 */
export function getEffectiveCumulativePenaltyFree(
  customProduct?: CustomProductRow | null
): { enabled: boolean; maxPercent: number } {
  const w = customProduct?.config?.withdrawals;
  const on = w?.cumulative_withdrawal === true;
  // Coerce before validating: config can arrive from JSON / AI-research as a
  // numeric string ("20"); Number.isFinite("20") is false, which would silently
  // DISABLE the cumulative rule for a product that actually has it. Number()
  // normalizes it. Clamp to (0, 100]: a free-withdrawal allowance above the whole
  // account value is not a real contract term, and absurd data must not neutralize
  // the cap. The caller floors the per-year allowance at the base penalty-free %,
  // so a maxPercent below the base simply degrades to flat behavior.
  const parsed = w?.cumulative_percent == null ? NaN : Number(w.cumulative_percent);
  const maxPercent = on && Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 0;
  return { enabled: on && maxPercent > 0, maxPercent };
}
