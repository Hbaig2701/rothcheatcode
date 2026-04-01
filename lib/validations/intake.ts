import { z } from "zod";
import { getStateByCode } from "@/lib/data/states";

export const intakeFormSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    age: z.number().int().min(18).max(100),
    filing_status: z.enum(["single", "married_filing_jointly"]),
    spouse_name: z.string().max(100).optional(),
    spouse_age: z.number().int().min(18).max(100).optional(),
    state: z.string().length(2, "State is required"),
    qualified_account_value: z.number().min(0, "Must be 0 or greater"),
    roth_ira: z.number().min(0).default(0),
    taxable_accounts: z.number().min(0).default(0),
    ssi_payout_age: z.number().int().min(62).max(70),
    ssi_annual_amount: z.number().min(0),
    spouse_ssi_payout_age: z.number().int().min(62).max(70).optional(),
    spouse_ssi_annual_amount: z.number().min(0).optional(),
    other_income_notes: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.filing_status === "married_filing_jointly") {
      if (!data.spouse_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Spouse name is required for married filing jointly",
          path: ["spouse_name"],
        });
      }
      if (!data.spouse_age) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Spouse age is required for married filing jointly",
          path: ["spouse_age"],
        });
      }
    }
  });

export type IntakeFormData = z.infer<typeof intakeFormSchema>;

/**
 * Convert intake form data (dollar amounts) to full client record data (cents)
 * with sensible defaults for all advisor-configured fields.
 *
 * This must match the columns in the `clients` table exactly.
 */
export function intakeToClientData(intake: IntakeFormData) {
  const stateInfo = getStateByCode(intake.state);
  const stateTaxRate = stateInfo ? stateInfo.topRate : 0;

  return {
    // Client-provided fields
    name: intake.name,
    age: intake.age,
    filing_status: intake.filing_status,
    spouse_name: intake.spouse_name || null,
    spouse_age: intake.spouse_age || null,
    state: intake.state,
    state_tax_rate: stateTaxRate,
    qualified_account_value: Math.round(intake.qualified_account_value * 100),
    roth_ira: Math.round(intake.roth_ira * 100),
    taxable_accounts: Math.round(intake.taxable_accounts * 100),
    ssi_payout_age: intake.ssi_payout_age,
    ssi_annual_amount: Math.round(intake.ssi_annual_amount * 100),
    spouse_ssi_payout_age: intake.spouse_ssi_payout_age || null,
    spouse_ssi_annual_amount: intake.spouse_ssi_annual_amount
      ? Math.round(intake.spouse_ssi_annual_amount * 100)
      : 0,
    non_ssi_income: [],

    // Default product settings (Generic Growth)
    blueprint_type: "fia",
    carrier_name: "Generic Carrier",
    product_name: "Generic Product",
    bonus_percent: 10,
    rate_of_return: 7,

    // Default tax settings
    tax_rate: 22,
    max_tax_rate: 24,
    constraint_type: "none",
    tax_payment_source: "from_taxable",

    // Default conversion settings
    conversion_type: "optimized_amount",
    protect_initial_premium: true,
    withdrawal_type: "no_withdrawals",

    // Default GI settings
    payout_type: "individual",
    income_start_age: 65,
    guaranteed_rate_of_return: 0,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,

    // Default advanced settings
    end_age: 95,
    heir_tax_rate: 40,
    surrender_years: 7,
    surrender_schedule: null,
    penalty_free_percent: 10,
    baseline_comparison_rate: 7,
    post_contract_rate: 7,
    years_to_defer_conversion: 0,
    widow_analysis: false,
    rmd_treatment: "reinvested",
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,
    fixed_conversion_amount: null,

    // Legacy fields (required by DB NOT NULL constraints)
    traditional_ira: Math.round(intake.qualified_account_value * 100),
    other_retirement: 0,
    pension: 0,
    other_income: 0,
    ss_self: Math.round(intake.ssi_annual_amount * 100),
    ss_spouse: intake.spouse_ssi_annual_amount
      ? Math.round(intake.spouse_ssi_annual_amount * 100)
      : 0,
    ss_start_age: intake.ssi_payout_age,
    growth_rate: 7,
    start_age: intake.age,
    sensitivity: false,
    include_niit: false,
    include_aca: false,
    date_of_birth: `${new Date().getFullYear() - intake.age}-01-01`,
    federal_bracket: "22",
    heir_bracket: "40",
    inflation_rate: 2.5,
    life_expectancy: 95,
    projection_years: 95 - intake.age,
    strategy: "moderate",
  };
}
