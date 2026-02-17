// Client type matching Supabase schema - Formula form design

// Non-SSI Income entry for the JSONB array
export interface NonSSIIncomeEntry {
  year: number;
  age: number | string;
  gross_taxable: number; // In cents
  tax_exempt: number;    // In cents
}

export interface Client {
  // System fields
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  // ===== Formula Type (Product Preset) =====
  blueprint_type: "fia" | "lincoln-optiblend-7" | "equitrust-marketedge-bonus" | "american-equity-assetshield-bonus-10"
    | "athene-ascent-pro-10" | "american-equity-incomeshield-bonus-10"
    | "equitrust-marketearly-income-index" | "north-american-income-pay-pro";

  // ===== Section 1: Client Data =====
  filing_status: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household";
  name: string;
  age: number;
  spouse_name: string | null;   // Spouse name (MFJ only)
  spouse_age: number | null;    // Spouse age (MFJ only)

  // ===== Section 2: Current Account Data =====
  qualified_account_value: number; // In cents

  // ===== Section 3: New Account Data (Insurance Product) =====
  carrier_name: string;
  product_name: string;
  bonus_percent: number;     // Percentage (e.g., 10 for 10%)
  rate_of_return: number;    // Percentage (e.g., 7 for 7%)
  anniversary_bonus_percent: number | null; // Anniversary bonus % (e.g., 4 for 4%) - EquiTrust phased bonus
  anniversary_bonus_years: number | null;   // Number of years anniversary bonus applies (e.g., 3)

  // ===== Section 4: Tax Data =====
  state: string; // 2-letter state code
  constraint_type: "bracket_ceiling" | "irmaa_threshold" | "fixed_amount" | "none";
  tax_rate: number;          // Current tax rate percentage
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

  // ===== Section 6: Conversion =====
  conversion_type: "optimized_amount" | "fixed_amount" | "full_conversion" | "no_conversion";
  fixed_conversion_amount: number | null; // Fixed dollar amount to convert per year (in cents), used when conversion_type = 'fixed_amount'
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
  rmd_treatment: 'spent' | 'reinvested' | 'cash'; // How RMDs are treated in baseline

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
  // Formula Type (Product Preset)
  blueprint_type: Client["blueprint_type"];

  // Section 1: Client Data
  filing_status: Client["filing_status"];
  name: string;
  age: number;
  spouse_name: string | null;
  spouse_age: number | null;

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
  rmd_treatment: 'spent' | 'reinvested' | 'cash';

  // Additional needed for tax payments
  taxable_accounts: number;
  roth_ira: number;
}
