/**
 * Optional input features an advisor can hide from the client input form
 * (Settings → Input Panel). The form had grown a long tail of add-ons built
 * for one advisor's case (QLAC, tax credits, held-back IRA, ...) that most
 * advisors never use and don't recognise — noise on a demo and on a first run.
 *
 * Hiding is UI-only and never changes a projection. Every feature here is
 * engine-active whenever its saved value is non-default, so a hidden feature
 * that a client already USES stays visible on that client (see `inUse`) —
 * otherwise a QLAC premium or "RMDs handled externally" would keep moving the
 * numbers with no input on screen to explain or undo it.
 *
 * Stored per advisor as user_settings.hidden_input_features (keys below).
 * Accounts created before this setting see everything; new accounts start
 * with every feature hidden (DB column default).
 *
 * Deliberately NOT here: inputs that always feed the math (heir tax rate,
 * RMD treatment, state tax) and the penalty-free limit, which picking a
 * custom product switches on automatically.
 */

export const INPUT_FEATURE_KEYS = [
  "qlac",
  "additional_deductions",
  "tax_credits",
  "irmaa_targeting",
  "rmds_external",
  "capital_gains",
  "advisory_fee",
  "aum_allocation",
  "withdrawals",
  "years_to_defer",
  "widow_penalty",
] as const;

export type InputFeatureKey = (typeof INPUT_FEATURE_KEYS)[number];

type Values = Record<string, unknown>;

export interface InputFeatureDef {
  key: InputFeatureKey;
  label: string;
  description: string;
  /** Where it appears in the form, for the Settings list. */
  location: string;
  /** Form fields `inUse` reads. */
  fields: readonly string[];
  /** True when this client's saved values make the feature affect results. */
  inUse: (v: Values) => boolean;
}

const num = (x: unknown) => (typeof x === "number" ? x : Number(x) || 0);

const PREFERENTIAL_INCOME_TYPES = ["capital_gains", "qualified_dividends"];

export const INPUT_FEATURES: readonly InputFeatureDef[] = [
  {
    key: "qlac",
    label: "QLAC",
    description: "Qualified Longevity Annuity Contract premium, income start age and death benefit.",
    location: "4. Tax Data",
    fields: ["qlac_premium"],
    inUse: (v) => num(v.qlac_premium) > 0,
  },
  {
    key: "additional_deductions",
    label: "Additional Deductions",
    description: "Annual deductions on top of the standard deduction (charitable, business losses, leveraged-deduction programs).",
    location: "4. Tax Data",
    fields: ["additional_deductions"],
    inUse: (v) => num(v.additional_deductions) > 0,
  },
  {
    key: "tax_credits",
    label: "Tax Credits",
    description: "A pool of tax credits that offsets federal tax and carries forward until used.",
    location: "4. Tax Data",
    fields: ["tax_credits"],
    inUse: (v) => num(v.tax_credits) > 0,
  },
  {
    key: "irmaa_targeting",
    label: "IRMAA Tier Targeting",
    description: "Cap conversions to keep the client under a chosen IRMAA tier (the Additional Constraint picker).",
    location: "4. Tax Data",
    fields: ["constraint_type"],
    inUse: (v) => v.constraint_type === "irmaa_threshold",
  },
  {
    key: "rmds_external",
    label: "RMDs Handled Externally / Held-back IRA",
    description: "Model a split where RMDs come from a separate IRA that isn't being converted.",
    location: "4. Tax Data",
    fields: ["rmds_handled_externally", "held_back_ira_balance"],
    inUse: (v) => v.rmds_handled_externally === true || num(v.held_back_ira_balance) > 0,
  },
  {
    key: "capital_gains",
    label: "Capital Gains & Qualified Dividends",
    description: "Income types taxed at the long-term capital gains rate, and the LTCG Rate field.",
    location: "4. Tax Data and 5. Taxable Income",
    fields: ["non_ssi_income"],
    inUse: (v) =>
      Array.isArray(v.non_ssi_income) &&
      v.non_ssi_income.some(
        (row) => !!row && PREFERENTIAL_INCOME_TYPES.includes((row as { type?: string }).type ?? ""),
      ),
  },
  {
    key: "advisory_fee",
    label: "Advisory Fee",
    description: "Charge an annual advisory fee on the money you manage.",
    location: "7. Advisory Fee & AUM Allocation",
    fields: ["advisory_fee_percent"],
    inUse: (v) => num(v.advisory_fee_percent) > 0,
  },
  {
    key: "aum_allocation",
    label: "AUM Allocation",
    description: "Set aside part of the IRA for you to manage, in a taxable account or a Roth.",
    location: "7. Advisory Fee & AUM Allocation",
    fields: ["aum_allocation_percent"],
    inUse: (v) => num(v.aum_allocation_percent) > 0,
  },
  {
    key: "withdrawals",
    label: "IRA / Roth Withdrawals",
    description: "Schedule voluntary distributions from the IRA or Roth.",
    location: "Its own section",
    fields: ["withdrawals"],
    inUse: (v) => Array.isArray(v.withdrawals) && v.withdrawals.length > 0,
  },
  {
    key: "years_to_defer",
    label: "Years to Defer Conversion",
    description: "Wait a number of years before conversions begin.",
    location: "Advanced Data",
    fields: ["years_to_defer_conversion"],
    inUse: (v) => num(v.years_to_defer_conversion) > 0,
  },
  {
    key: "widow_penalty",
    label: "Widow's Penalty Analysis",
    description: "Show the tax impact on a surviving spouse after the first death (married clients).",
    location: "Advanced Data",
    fields: ["widow_analysis"],
    inUse: (v) => v.widow_analysis === true,
  },
];

export const INPUT_FEATURES_BY_KEY = Object.fromEntries(
  INPUT_FEATURES.map((f) => [f.key, f]),
) as Record<InputFeatureKey, InputFeatureDef>;
