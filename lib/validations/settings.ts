import { z } from "zod";
import {
  filingStatusEnum,
  constraintTypeEnum,
  conversionTypeEnum,
  withdrawalTypeEnum,
  taxSourceEnum,
  formulaTypeEnum,
} from "./client";

// ============================================================================
// Profile Tab
// ============================================================================

export const profileSchema = z.object({
  first_name: z.string().max(100).optional().nullable(),
  last_name: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

// ============================================================================
// Security Tab
// ============================================================================

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[0-9]/, "Password must contain at least 1 number")
      .regex(
        /[!@#$%^&*(),.?":{}|<>]/,
        "Password must contain at least 1 special character"
      ),
    confirm_password: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  new_email: z.string().email("Please enter a valid email"),
});

export type ChangeEmailFormData = z.infer<typeof changeEmailSchema>;

// ============================================================================
// Business & Logo Tab
// ============================================================================

export const businessSchema = z.object({
  company_name: z.string().max(200).optional().nullable(),
  tagline: z.string().max(200).optional().nullable(),
  company_phone: z.string().max(20).optional().nullable(),
  company_email: z
    .string()
    .email()
    .optional()
    .nullable()
    .or(z.literal("")),
  company_website: z
    .string()
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string().max(500).optional().nullable(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  secondary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
});

export type BusinessFormData = z.infer<typeof businessSchema>;

// ============================================================================
// Default Values Tab
// ============================================================================

export const defaultValuesSchema = z.object({
  // Tax Defaults
  state: z.string().length(2).optional().or(z.literal("")),
  filing_status: filingStatusEnum.optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  max_tax_rate: z.number().min(0).max(100).optional(),
  tax_payment_source: taxSourceEnum.optional(),
  constraint_type: constraintTypeEnum.optional(),
  heir_tax_rate: z.number().min(0).max(100).optional(),

  // Account Defaults
  rate_of_return: z.number().min(0).max(30).optional(),
  baseline_comparison_rate: z.number().min(0).max(30).optional(),
  post_contract_rate: z.number().min(0).max(30).optional(),
  end_age: z.number().int().min(55).max(120).optional(),
  years_to_defer_conversion: z.number().int().min(0).max(30).optional(),

  // Product Defaults
  blueprint_type: formulaTypeEnum.optional(),
  conversion_type: conversionTypeEnum.optional(),
  protect_initial_premium: z.boolean().optional(),
  withdrawal_type: withdrawalTypeEnum.optional(),
  bonus_percent: z.number().min(0).max(100).optional(),
  surrender_years: z.number().int().min(0).max(20).optional(),
  penalty_free_percent: z.number().min(0).max(100).optional(),
  carrier_name: z.string().max(100).optional(),
  product_name: z.string().max(100).optional(),
});

export type DefaultValuesFormData = z.infer<typeof defaultValuesSchema>;
