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

export const strategyEnum = z.enum([
  "conservative",
  "moderate",
  "aggressive",
  "irmaa_safe",
]);

export const taxSourceEnum = z.enum(["from_ira", "from_taxable"]);

// ============================================================================
// Legacy Schemas (for backwards compatibility)
// ============================================================================

export const clientCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  state: z.string().length(2, "Use 2-letter state code (e.g., CA, NY)"),
  filing_status: z.enum(
    ["single", "married_filing_jointly", "married_filing_separately", "head_of_household"],
    { message: "Select a valid filing status" }
  ),
});

export const clientUpdateSchema = clientCreateSchema.partial();

// Infer types from schemas for form usage
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

// ============================================================================
// Full 28-Field Client Schema
// ============================================================================

// Base schema without refinements (for .partial() compatibility)
export const clientFullBaseSchema = z.object({
    // Personal Information (6 fields)
    name: z.string().min(1, { error: "Name is required" }).max(100, { error: "Name must be 100 characters or less" }),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD format" }),
    state: z.string().length(2, { error: "Use 2-letter state code" }),
    filing_status: filingStatusEnum,
    spouse_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD format" }).optional().nullable(),
    life_expectancy: z.number().int().min(1).max(120).optional().nullable(),

    // Account Balances (4 fields) - stored as cents (integers)
    traditional_ira: z.number().int().min(0, { error: "Amount must be positive" }),
    roth_ira: z.number().int().min(0, { error: "Amount must be positive" }).default(0),
    taxable_accounts: z.number().int().min(0, { error: "Amount must be positive" }).default(0),
    other_retirement: z.number().int().min(0, { error: "Amount must be positive" }).default(0),

    // Tax Configuration (4 fields)
    federal_bracket: z.string().default("auto"),
    state_tax_rate: z.number().min(0).max(100).optional().nullable(),
    include_niit: z.boolean().default(true),
    include_aca: z.boolean().default(false),

    // Income Sources (5 fields) - stored as cents
    ss_self: z.number().int().min(0, { error: "Amount must be positive" }).default(0),
    ss_spouse: z.number().int().min(0, { error: "Amount must be positive" }).default(0),
    pension: z.number().int().min(0, { error: "Amount must be positive" }).default(0),
    other_income: z.number().int().min(0, { error: "Amount must be positive" }).default(0),
    ss_start_age: z.number().int().min(62).max(70).default(67),

    // Conversion Settings (4 fields)
    strategy: strategyEnum.default("moderate"),
    start_age: z.number().int().min(50).max(90),
    end_age: z.number().int().min(55).max(95).default(75),
    tax_payment_source: taxSourceEnum.default("from_taxable"),

    // Advanced Options (6 fields)
    growth_rate: z.number().min(0).max(20).default(6),
    inflation_rate: z.number().min(0).max(10).default(2.5),
    heir_bracket: z.string().default("32"),
    projection_years: z.number().int().min(10).max(60).default(40),
    widow_analysis: z.boolean().default(false),
    sensitivity: z.boolean().default(false),
  });

// Partial schema for updates (no refinements, all fields optional)
export const clientFullPartialSchema = clientFullBaseSchema.partial();

// Full schema with refinements (for create/full validation)
export const clientFullSchema = clientFullBaseSchema.superRefine((data, ctx) => {
  // Spouse DOB required when filing status includes "married"
  if (
    (data.filing_status === "married_filing_jointly" ||
      data.filing_status === "married_filing_separately") &&
    !data.spouse_dob
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse date of birth is required for married filing status",
      path: ["spouse_dob"],
    });
  }

  // End age must be greater than start age
  if (data.end_age <= data.start_age) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End age must be greater than start age",
      path: ["end_age"],
    });
  }
});

// Infer full form data type from schema
// z.infer gives the output type (after defaults applied)
export type ClientFullFormData = z.infer<typeof clientFullSchema>;

// Explicit form type with all fields required for form defaultValues
// This avoids issues where .default() makes fields optional in input type
export type ClientFormData = {
  // Personal Information (6 fields)
  name: string;
  date_of_birth: string;
  state: string;
  filing_status: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household";
  spouse_dob: string | null;
  life_expectancy: number | null;

  // Account Balances (4 fields) - stored as cents
  traditional_ira: number;
  roth_ira: number;
  taxable_accounts: number;
  other_retirement: number;

  // Tax Configuration (4 fields)
  federal_bracket: string;
  state_tax_rate: number | null;
  include_niit: boolean;
  include_aca: boolean;

  // Income Sources (5 fields) - stored as cents
  ss_self: number;
  ss_spouse: number;
  pension: number;
  other_income: number;
  ss_start_age: number;

  // Conversion Settings (4 fields)
  strategy: "conservative" | "moderate" | "aggressive" | "irmaa_safe";
  start_age: number;
  end_age: number;
  tax_payment_source: "from_ira" | "from_taxable";

  // Advanced Options (6 fields)
  growth_rate: number;
  inflation_rate: number;
  heir_bracket: string;
  projection_years: number;
  widow_analysis: boolean;
  sensitivity: boolean;
};
