import { z } from "zod";

// ============================================================================
// Enum Schemas
// ============================================================================

export const filingStatusEnum = z.enum([
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
]);

export const constraintTypeEnum = z.enum([
  "bracket_ceiling",
  "irmaa_threshold",
  "fixed_amount",
  "none",
]);

export const conversionTypeEnum = z.enum([
  "optimized_amount",
  "fixed_amount",
  "full_conversion",
  "no_conversion",
]);

export const withdrawalTypeEnum = z.enum([
  "no_withdrawals",
  "systematic",
  "penalty_free",
]);

export const taxSourceEnum = z.enum(["from_ira", "from_taxable"]);

export const rmdTreatmentEnum = z.enum(["spent", "reinvested", "cash"]);

export const formulaTypeEnum = z.enum([
  "fia",
  "lincoln-optiblend-7",
  "equitrust-marketedge-bonus",
  "american-equity-assetshield-bonus-10",
  "athene-ascent-pro-10",
  "american-equity-incomeshield-bonus-10",
  "equitrust-marketearly-income-index",
  "north-american-income-pay-pro",
]);

// Legacy strategy enum (for backwards compatibility)
export const strategyEnum = z.enum([
  "conservative",
  "moderate",
  "aggressive",
  "irmaa_safe",
]);

// ============================================================================
// Non-SSI Income Entry Schema
// ============================================================================

export const nonSSIIncomeEntrySchema = z.object({
  year: z.number().int().min(2024).max(2100),
  age: z.union([z.number(), z.string()]), // Allow "62/60" format
  gross_taxable: z.number().int().min(0), // In cents
  tax_exempt: z.number().int().min(0),    // In cents
});

// ============================================================================
// Formula Form Schema (8 sections)
// ============================================================================

export const clientFormulaBaseSchema = z.object({
  // Formula Type (product preset)
  blueprint_type: formulaTypeEnum.default("fia"),

  // Section 1: Client Data
  filing_status: filingStatusEnum,
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  age: z.number().int().min(18, "Age must be at least 18").max(100, "Age must be 100 or less"),
  spouse_name: z.string().max(100).optional(),
  // NaN-safe: HTML number inputs with valueAsNumber produce NaN for empty values
  spouse_age: z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v)) ? undefined : v,
    z.number().int().min(18).max(100).optional()
  ),

  // Section 2: Current Account Data
  qualified_account_value: z.number().int().min(0, "Amount must be positive"),

  // Section 3: New Account Data (Insurance Product)
  carrier_name: z.string().min(1, "Carrier name is required").max(100).default("Generic Carrier"),
  product_name: z.string().min(1, "Product name is required").max(100).default("Generic Product"),
  bonus_percent: z.number().min(0, "Bonus must be non-negative").max(100, "Bonus cannot exceed 100%").default(10),
  rate_of_return: z.number().min(0, "Rate must be non-negative").max(30, "Rate cannot exceed 30%").default(7),
  anniversary_bonus_percent: z.number().min(0).max(100).optional().nullable().default(null),
  anniversary_bonus_years: z.number().int().min(0).max(10).optional().nullable().default(null),

  // Section 4: Tax Data
  state: z.string().length(2, "Use 2-letter state code"),
  constraint_type: constraintTypeEnum.default("none"),
  tax_rate: z.number().min(0).max(100).default(24),
  max_tax_rate: z.number().min(0).max(100).default(24),
  tax_payment_source: taxSourceEnum.default("from_taxable"),
  state_tax_rate: z.number().min(0).max(100).optional().nullable(),

  // Section 5: Taxable Income Calculation
  ssi_payout_age: z.number().int().min(62, "SSI starts at 62 minimum").max(70, "SSI starts at 70 maximum").default(67),
  ssi_annual_amount: z.number().int().min(0, "Amount must be positive").default(2400000), // $24,000 in cents
  // NaN-safe: HTML number inputs with valueAsNumber produce NaN for empty values
  spouse_ssi_payout_age: z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v)) ? undefined : v,
    z.number().int().min(62).max(70).optional()
  ),
  spouse_ssi_annual_amount: z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v)) ? undefined : v,
    z.number().int().min(0).optional()
  ),
  non_ssi_income: z.array(nonSSIIncomeEntrySchema).default([]),

  // Section 6: Conversion
  conversion_type: conversionTypeEnum.default("optimized_amount"),
  fixed_conversion_amount: z.number().int().min(0).optional().nullable().default(null),
  protect_initial_premium: z.boolean().default(true),

  // Section 7: Roth Withdrawals
  withdrawal_type: withdrawalTypeEnum.default("no_withdrawals"),

  // GI-specific fields
  payout_type: z.enum(['individual', 'joint']).default('individual'),
  income_start_age: z.number().int().min(55, "Income start age minimum 55").max(80, "Income start age maximum 80").default(65),
  guaranteed_rate_of_return: z.number().min(0).max(30).default(0),
  roll_up_option: z.enum(['simple', 'compound']).nullable().default(null),
  payout_option: z.enum(['level', 'increasing']).nullable().default(null),
  gi_conversion_years: z.number().int().min(1, "Minimum 1 year").max(15, "Maximum 15 years").default(5),
  gi_conversion_bracket: z.number().min(10).max(40).default(24),

  // Section 8: Advanced Data
  surrender_years: z.number().int().min(0).max(20).default(7),
  surrender_schedule: z.array(z.number().min(0).max(100)).optional().nullable().default(null),
  penalty_free_percent: z.number().min(0).max(100).default(10),
  baseline_comparison_rate: z.number().min(0).max(30).default(7),
  post_contract_rate: z.number().min(0).max(30).default(7),
  years_to_defer_conversion: z.number().int().min(0).max(30).default(0),
  end_age: z.number().int().min(55).max(120).default(100),
  heir_tax_rate: z.number().min(0).max(100).default(40),
  widow_analysis: z.boolean().default(false),
  rmd_treatment: rmdTreatmentEnum.default("reinvested"),

  // Additional fields needed for calculations
  taxable_accounts: z.number().int().min(0).default(0),
  roth_ira: z.number().int().min(0).default(0),
});

// Add refinements for the full schema
export const clientFormulaSchema = clientFormulaBaseSchema.superRefine((data, ctx) => {
  // End age must be greater than current age
  if (data.end_age <= data.age) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End age must be greater than current age",
      path: ["end_age"],
    });
  }

  // Max tax rate should be >= current tax rate
  if (data.max_tax_rate < data.tax_rate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Max tax rate cannot be less than current tax rate",
      path: ["max_tax_rate"],
    });
  }

  // SSI payout age should be >= current age (unless already receiving)
  if (data.ssi_payout_age < data.age && data.ssi_annual_amount > 0) {
    // Allow if already past payout age - they're receiving SSI
  }
});

// Partial schema for updates
export const clientFormulaPartialSchema = clientFormulaBaseSchema.partial();

// Type exports
export type ClientFormulaFormData = z.infer<typeof clientFormulaSchema>;
export type NonSSIIncomeEntry = z.infer<typeof nonSSIIncomeEntrySchema>;

// ============================================================================
// Legacy Schemas (for backwards compatibility during transition)
// ============================================================================

export const clientCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional(),
  age: z.number().int().min(18).max(100).optional(),
  state: z.string().length(2, "Use 2-letter state code (e.g., CA, NY)"),
  filing_status: z.enum(
    ["single", "married_filing_jointly", "married_filing_separately", "head_of_household"],
    { message: "Select a valid filing status" }
  ),
});

export const clientUpdateSchema = clientCreateSchema.partial();

// Legacy types
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

// ============================================================================
// Full 28-Field Client Schema (Legacy - kept for backwards compatibility)
// ============================================================================

export const clientFullBaseSchema = z.object({
  // Personal Information
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format").optional().nullable(),
  age: z.number().int().min(18).max(100).default(62),
  state: z.string().length(2, "Use 2-letter state code"),
  filing_status: filingStatusEnum,
  spouse_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format").optional().nullable(),
  spouse_name: z.string().max(100).optional().nullable(),
  spouse_age: z.number().int().min(18).max(100).optional().nullable(),
  life_expectancy: z.number().int().min(1).max(120).optional().nullable(),

  // Formula Type (product preset)
  blueprint_type: formulaTypeEnum.default("fia"),

  // GI-specific fields
  payout_type: z.enum(['individual', 'joint']).default('individual'),
  income_start_age: z.number().int().min(55).max(80).default(65),
  guaranteed_rate_of_return: z.number().min(0).max(30).default(0),
  roll_up_option: z.enum(['simple', 'compound']).nullable().default(null),
  payout_option: z.enum(['level', 'increasing']).nullable().default(null),
  gi_conversion_years: z.number().int().min(1).max(15).default(5),
  gi_conversion_bracket: z.number().min(10).max(40).default(24),

  // Spouse SSI fields
  spouse_ssi_payout_age: z.number().int().min(62).max(70).optional().nullable(),
  spouse_ssi_annual_amount: z.number().int().min(0).optional().nullable(),

  // Taxable income fields
  gross_taxable_non_ssi: z.number().int().min(0).optional().nullable(),
  tax_exempt_non_ssi: z.number().int().min(0).optional().nullable(),

  // Account Balances (legacy)
  traditional_ira: z.number().int().min(0).default(0),
  roth_ira: z.number().int().min(0).default(0),
  taxable_accounts: z.number().int().min(0).default(0),
  other_retirement: z.number().int().min(0).default(0),

  // New account value
  qualified_account_value: z.number().int().min(0).default(0),

  // New Account (Insurance Product)
  carrier_name: z.string().default("Generic Carrier"),
  product_name: z.string().default("Generic Product"),
  bonus_percent: z.number().min(0).max(100).default(10),
  rate_of_return: z.number().min(0).max(30).default(7),
  anniversary_bonus_percent: z.number().min(0).max(100).optional().nullable().default(null),
  anniversary_bonus_years: z.number().int().min(0).max(10).optional().nullable().default(null),

  // Tax Configuration
  federal_bracket: z.string().default("auto"),
  state_tax_rate: z.number().min(0).max(100).optional().nullable(),
  include_niit: z.boolean().default(true),
  include_aca: z.boolean().default(false),
  constraint_type: constraintTypeEnum.default("none"),
  tax_rate: z.number().min(0).max(100).default(24),
  max_tax_rate: z.number().min(0).max(100).default(24),

  // Income Sources (legacy)
  ss_self: z.number().int().min(0).default(0),
  ss_spouse: z.number().int().min(0).default(0),
  pension: z.number().int().min(0).default(0),
  other_income: z.number().int().min(0).default(0),
  ss_start_age: z.number().int().min(62).max(70).default(67),

  // New income fields
  ssi_payout_age: z.number().int().min(62).max(70).default(67),
  ssi_annual_amount: z.number().int().min(0).default(2400000),
  non_ssi_income: z.array(nonSSIIncomeEntrySchema).default([]),

  // Conversion Settings
  strategy: strategyEnum.default("moderate"),
  conversion_type: conversionTypeEnum.default("optimized_amount"),
  fixed_conversion_amount: z.number().int().min(0).optional().nullable().default(null),
  protect_initial_premium: z.boolean().default(true),
  start_age: z.number().int().min(50).max(90).default(62),
  end_age: z.number().int().min(55).max(120).default(100),
  tax_payment_source: taxSourceEnum.default("from_taxable"),

  // Withdrawals
  withdrawal_type: withdrawalTypeEnum.default("no_withdrawals"),

  // Advanced Options
  growth_rate: z.number().min(0).max(20).default(6),
  inflation_rate: z.number().min(0).max(10).default(2.5),
  heir_bracket: z.string().default("32"),
  heir_tax_rate: z.number().min(0).max(100).default(40),
  projection_years: z.number().int().min(10).max(60).default(40),
  widow_analysis: z.boolean().default(false),
  sensitivity: z.boolean().default(false),
  surrender_years: z.number().int().min(0).max(20).default(7),
  surrender_schedule: z.array(z.number().min(0).max(100)).optional().nullable().default(null),
  penalty_free_percent: z.number().min(0).max(100).default(10),
  baseline_comparison_rate: z.number().min(0).max(30).default(7),
  post_contract_rate: z.number().min(0).max(30).default(7),
  years_to_defer_conversion: z.number().int().min(0).max(30).default(0),
  rmd_treatment: rmdTreatmentEnum.default("reinvested"),
});

// Partial schema for updates
export const clientFullPartialSchema = clientFullBaseSchema.partial();

// Full schema with refinements
export const clientFullSchema = clientFullBaseSchema.superRefine((data, ctx) => {
  // Spouse DOB required when filing status includes "married"
  if (
    (data.filing_status === "married_filing_jointly" ||
      data.filing_status === "married_filing_separately") &&
    !data.spouse_dob &&
    data.date_of_birth // Only enforce if using legacy date_of_birth
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse date of birth is required for married filing status",
      path: ["spouse_dob"],
    });
  }

  // End age must be greater than start age (or current age)
  const currentAge = data.age || data.start_age || 62;
  if (data.end_age <= currentAge) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End age must be greater than current/start age",
      path: ["end_age"],
    });
  }
});

// Infer full form data type from schema
export type ClientFullFormData = z.infer<typeof clientFullSchema>;

// Explicit form type with all fields required for form defaultValues
export type ClientFormData = {
  // Formula Type (product preset)
  blueprint_type: "fia" | "lincoln-optiblend-7" | "equitrust-marketedge-bonus" | "american-equity-assetshield-bonus-10"
    | "athene-ascent-pro-10" | "american-equity-incomeshield-bonus-10"
    | "equitrust-marketearly-income-index" | "north-american-income-pay-pro";

  // Section 1: Client Data
  filing_status: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household";
  name: string;
  age: number;
  spouse_name?: string;
  spouse_age?: number;

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
  constraint_type: "bracket_ceiling" | "irmaa_threshold" | "fixed_amount" | "none";
  tax_rate: number;
  max_tax_rate: number;
  tax_payment_source: "from_ira" | "from_taxable";
  state_tax_rate: number | null;

  // Section 5: Taxable Income
  ssi_payout_age: number;
  ssi_annual_amount: number;
  spouse_ssi_payout_age?: number;
  spouse_ssi_annual_amount?: number;
  non_ssi_income: Array<{
    year: number;
    age: number | string;
    gross_taxable: number;
    tax_exempt: number;
  }>;

  // Section 6: Conversion
  conversion_type: "optimized_amount" | "fixed_amount" | "full_conversion" | "no_conversion";
  fixed_conversion_amount: number | null;
  protect_initial_premium: boolean;

  // Section 7: Withdrawals
  withdrawal_type: "no_withdrawals" | "systematic" | "penalty_free";

  // GI-specific
  payout_type: "individual" | "joint";
  income_start_age: number;
  guaranteed_rate_of_return: number;
  roll_up_option: "simple" | "compound" | null;
  payout_option: "level" | "increasing" | null;
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
  rmd_treatment: "spent" | "reinvested" | "cash";

  // Additional
  taxable_accounts: number;
  roth_ira: number;

  // Legacy fields (optional for form, kept for backwards compatibility)
  date_of_birth?: string | null;
  spouse_dob?: string | null;
  life_expectancy?: number | null;
  traditional_ira?: number;
  other_retirement?: number;
  federal_bracket?: string;
  include_niit?: boolean;
  include_aca?: boolean;
  ss_self?: number;
  ss_spouse?: number;
  pension?: number;
  other_income?: number;
  ss_start_age?: number;
  strategy?: "conservative" | "moderate" | "aggressive" | "irmaa_safe";
  start_age?: number;
  growth_rate?: number;
  inflation_rate?: number;
  heir_bracket?: string;
  projection_years?: number;
  sensitivity?: boolean;
};
