// Client type matching Supabase schema - Formula form design

// Non-SSI Income entry for the JSONB array
export const INCOME_TYPES = [
  { value: "pension", label: "Pension" },
  { value: "rental", label: "Rental Income" },
  { value: "dividends", label: "Dividends & Interest" },
  { value: "capital_gains", label: "Capital Gains" },
  { value: "wages", label: "Part-Time Work / Wages" },
  { value: "annuity", label: "Annuity Income" },
  { value: "other", label: "Other" },
] as const;

export type IncomeType = (typeof INCOME_TYPES)[number]["value"];

export interface NonSSIIncomeEntry {
  year: number;
  age: number | string;
  gross_taxable: number; // In cents
  tax_exempt: number;    // In cents
  type?: IncomeType;     // Optional — existing data has no type (displays as "Other")
}

/**
 * One year's voluntary withdrawal from the IRA or Roth, on top of any RMD or
 * conversion the engine computes. Distinct from `NonSSIIncomeEntry` (which is
 * income from OUTSIDE the portfolio — pension, rental, wages); these rows
 * actually pull from the qualified balance.
 *
 * `source`:
 *   - 'ira'  — pull from IRA only. Adds to taxable income; 10% penalty if age < 59.5.
 *   - 'roth' — pull from Roth only. Tax-free (assumed qualified — 5-yr rule + 59.5).
 *   - 'auto' — pull from Roth first (tax-free), remainder from IRA. Most useful for
 *              comparing baseline vs strategy: baseline naturally falls to IRA, the
 *              strategy uses the Roth bucket the conversions built up.
 */
export type WithdrawalSource = 'ira' | 'roth' | 'auto';
export interface WithdrawalEntry {
  year: number;
  age: number | string;  // for display only — engine uses year
  amount: number;        // cents
  source: WithdrawalSource;
}

export interface Client {
  // System fields
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  // ===== Product Preset =====
  blueprint_type: "fia" | "short-term-cap-growth" | "phased-bonus-growth" | "vesting-bonus-growth" | "high-bonus-long-term-growth" | "high-bonus-medium-term-growth"
    | "simple-rollup-income" | "compound-rollup-income" | "flat-rate-compound-income" | "generic-income";
  // Reference to custom product (null for system presets). When set, blueprint_type holds the engine_preset.
  custom_product_id: string | null;

  // ===== Section 1: Client Data =====
  scenario_name: string | null;
  filing_status: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household";
  name: string;
  age: number;
  spouse_name: string | null;   // Spouse name (MFJ only)
  spouse_age: number | null;    // Spouse age (MFJ only)
  // Contact info — added 2026-06-08 to support permanent intake links where
  // the advisor has no prior contact with the prospect. Nullable so manually-
  // created clients in the advisor's form can leave them blank. Intake form
  // requires email; phone is optional.
  client_email: string | null;
  client_phone: string | null;

  // ===== Section 2: Current Account Data =====
  qualified_account_value: number; // In cents

  // ===== Section 3: New Account Data (Insurance Product) =====
  carrier_name: string;
  product_name: string;
  bonus_percent: number;     // Percentage (e.g., 10 for 10%)
  rate_of_return: number;    // Percentage (e.g., 7 for 7%)
  anniversary_bonus_percent: number | null; // Anniversary bonus % (e.g., 4 for 4%) - Phased Bonus Growth
  anniversary_bonus_years: number | null;   // Number of years anniversary bonus applies (e.g., 3)

  // ===== Section 4: Tax Data =====
  state: string; // 2-letter state code
  // 'fixed_amount' and 'none' are legacy values still accepted on read
  // (existed pre-2026-06-05). The form now only emits 'bracket_ceiling' or
  // 'irmaa_threshold'.
  constraint_type: "bracket_ceiling" | "irmaa_threshold" | "fixed_amount" | "none";
  // Advisor's chosen ceiling tier — only consulted by the engine when
  // constraint_type === 'irmaa_threshold'. Optional for back-compat with
  // rows from before the field existed.
  target_irmaa_tier?: "standard" | "tier_1" | "tier_2" | "tier_3" | "tier_4" | "tier_5";
  tax_rate: number;          // Current tax rate percentage (deprecated; see notes)
  max_tax_rate: number;      // Maximum tax rate ceiling
  tax_payment_source: "from_ira" | "from_taxable";
  state_tax_rate: number | null;

  // ===== Section 5: Taxable Income Calculation =====
  gross_taxable_non_ssi: number;  // Annual taxable income (non-SSI) in cents
  tax_exempt_non_ssi: number;     // Annual tax-exempt income in cents
  ssi_payout_age: number;         // Age to start SSI (primary)
  ssi_annual_amount: number;      // Annual SSI (primary) in cents
  spouse_ssi_payout_age: number | null;  // Spouse SSI start age (MFJ only)
  spouse_ssi_annual_amount: number | null; // Spouse SSI amount (MFJ only)
  non_ssi_income: NonSSIIncomeEntry[];  // JSONB array of income entries
  withdrawals: WithdrawalEntry[];        // Voluntary IRA/Roth withdrawals on top of RMDs/conversions

  // ===== Section 6: Conversion =====
  conversion_type: "optimized_amount" | "fixed_amount" | "full_conversion" | "no_conversion" | "partial_amount";
  fixed_conversion_amount: number | null; // Fixed dollar amount to convert per year (in cents), used when conversion_type = 'fixed_amount'
  target_partial_amount: number | null;   // Total amount to convert across all years (in cents), used when conversion_type = 'partial_amount'
  respect_penalty_free_limit: boolean;    // When true, cap each year's conversion at penalty_free_percent × beginning-of-year IRA
  // Scope of what the carrier penalty-free cap restricts when
  // respect_penalty_free_limit is true:
  //   - 'tax_only'        : only tax dollars pulled from the IRA count
  //                         against the cap (default, intra-carrier
  //                         Trad → Roth conversion exempt).
  //   - 'all_distributions': conversion + RMD + tax-from-IRA all count
  //                         against the cap (strict reading).
  // Optional so legacy fixtures / scripts that build Client objects don't
  // all need to set it. Engine falls back to 'tax_only' (legacy behavior).
  penalty_free_scope?: 'tax_only' | 'all_distributions';
  protect_initial_premium: boolean;

  // ===== Section 7: Roth Withdrawals =====
  withdrawal_type: "no_withdrawals" | "systematic" | "penalty_free";

  // ===== GI-Specific Fields =====
  payout_type: 'individual' | 'joint';
  income_start_age: number;
  guaranteed_rate_of_return: number;
  roll_up_option: 'simple' | 'compound' | null;
  payout_option: 'level' | 'increasing' | null;

  // GI Conversion Settings (for 4-phase model)
  gi_conversion_years: number;              // Years to convert before GI purchase (default 5)
  gi_conversion_bracket: number;            // Target tax bracket for conversions (default 24)

  // ===== Section 8: Advanced Data =====
  surrender_years: number;
  surrender_schedule: number[] | null; // Array of surrender charge percentages by year (e.g., [16, 14.5, 13, ...])
  penalty_free_percent: number;     // Percentage
  baseline_comparison_rate: number; // Percentage
  post_contract_rate: number;       // Percentage
  years_to_defer_conversion: number;
  end_age: number;
  heir_tax_rate: number;            // Percentage
  widow_analysis: boolean;
  // Age of the older spouse when first death occurs. When null, the analyzer
  // falls back to the heuristic (older spouse's birth year + 85). Range
  // enforced by the form is 60-100.
  widow_death_age: number | null;
  rmd_treatment: 'spent' | 'reinvested' | 'cash'; // How RMDs are treated in baseline
  // Split-bucket strategies: when the advisor is modeling ONLY part of the
  // client's IRA (e.g., $1.3M to Athene, $1.2M staying at Fidelity), real-world
  // RMDs are typically taken from the bucket NOT being modeled here. With this
  // toggle ON, the engine skips RMD computation entirely for BOTH baseline and
  // strategy (keeping the comparison fair) so the modeled bucket doesn't get
  // RMDs eating into the conversion target. Advisor should add the external
  // RMD as Other Income in Section 5 if they want the full tax picture.
  rmds_handled_externally: boolean;

  // ===== AUM Split Allocation =====
  // When aum_allocation_percent > 0, the engine splits the IRA balance: the
  // first (100 - aum_allocation_percent)% runs through the existing Roth
  // conversion engine; the remainder runs through the AUM brokerage engine.
  // 0 means "no AUM" — current behavior preserved.
  aum_allocation_percent: number;     // 0-100
  aum_fee_percent: number;            // Annual AUM fee (default 1)
  aum_dividend_yield: number;         // Annual dividend yield % (default 2) — taxed at LTCG
  aum_turnover_percent: number;       // Annual turnover % of unrealized gains (default 10) — taxed at LTCG
  aum_withdrawal_years: number;       // Years to spread the IRA-to-AUM transfer over (default 5)
  ltcg_rate: number;                  // Long-term capital gains rate (default 15) — used for AUM tax drag

  // ===== Legacy fields (kept for backwards compatibility) =====
  date_of_birth: string | null;  // ISO date string YYYY-MM-DD (deprecated, use age)
  spouse_dob: string | null;
  life_expectancy: number | null;
  traditional_ira: number;       // Deprecated, use qualified_account_value
  roth_ira: number;              // Still used for tracking Roth balance
  taxable_accounts: number;      // Still used for tax payment source
  other_retirement: number;      // Deprecated, use qualified_account_value
  federal_bracket: string;       // Deprecated, use tax_rate
  include_niit: boolean;         // Deprecated
  include_aca: boolean;          // Deprecated
  ss_self: number;               // Deprecated, use ssi_annual_amount
  ss_spouse: number;             // Deprecated, use ssi_annual_amount
  pension: number;               // Deprecated, use non_ssi_income
  other_income: number;          // Deprecated, use non_ssi_income
  ss_start_age: number;          // Deprecated, use ssi_payout_age
  strategy: "conservative" | "moderate" | "aggressive" | "irmaa_safe"; // Deprecated, use conversion_type
  start_age: number;             // Deprecated, use age + years_to_defer_conversion
  growth_rate: number;           // Deprecated, use rate_of_return
  inflation_rate: number;        // Deprecated
  heir_bracket: string;          // Deprecated, use heir_tax_rate
  projection_years: number;      // Computed from end_age - age
  sensitivity: boolean;          // Deprecated
}

// For creating a new client - omit system fields
export type ClientInsert = Omit<Client, "id" | "user_id" | "created_at" | "updated_at">;

// For updating a client - all fields optional
export type ClientUpdate = Partial<ClientInsert>;

// Formula-specific form data (subset of Client without legacy fields)
export interface FormulaFormData {
  // Product Preset
  blueprint_type: Client["blueprint_type"];

  // Section 1: Client Data
  scenario_name: string | null;
  filing_status: Client["filing_status"];
  name: string;
  age: number;
  spouse_name: string | null;
  spouse_age: number | null;
  client_email: string | null;
  client_phone: string | null;

  // Section 2: Current Account
  qualified_account_value: number;

  // Section 3: New Account
  carrier_name: string;
  product_name: string;
  bonus_percent: number;
  rate_of_return: number;
  anniversary_bonus_percent: number | null;
  anniversary_bonus_years: number | null;

  // Section 4: Tax Data
  state: string;
  constraint_type: Client["constraint_type"];
  tax_rate: number;
  max_tax_rate: number;
  tax_payment_source: Client["tax_payment_source"];
  state_tax_rate: number | null;

  // Section 5: Taxable Income
  gross_taxable_non_ssi: number;
  tax_exempt_non_ssi: number;
  ssi_payout_age: number;
  ssi_annual_amount: number;
  spouse_ssi_payout_age: number | null;
  spouse_ssi_annual_amount: number | null;
  non_ssi_income: NonSSIIncomeEntry[];
  withdrawals: WithdrawalEntry[];

  // Section 6: Conversion
  conversion_type: Client["conversion_type"];
  fixed_conversion_amount: number | null;
  protect_initial_premium: boolean;

  // Section 7: Withdrawals
  withdrawal_type: Client["withdrawal_type"];

  // GI-specific
  payout_type: Client["payout_type"];
  income_start_age: number;
  guaranteed_rate_of_return: number;
  roll_up_option: 'simple' | 'compound' | null;
  payout_option: 'level' | 'increasing' | null;
  gi_conversion_years: number;
  gi_conversion_bracket: number;

  // Section 8: Advanced
  surrender_years: number;
  surrender_schedule: number[] | null;
  penalty_free_percent: number;
  baseline_comparison_rate: number;
  post_contract_rate: number;
  years_to_defer_conversion: number;
  end_age: number;
  heir_tax_rate: number;
  widow_analysis: boolean;
  widow_death_age: number | null;
  rmd_treatment: 'spent' | 'reinvested' | 'cash';
  rmds_handled_externally: boolean;

  // Additional needed for tax payments
  taxable_accounts: number;
  roth_ira: number;
}
