export interface UserSettings {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  // Profile
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;

  // Business & Logo
  company_name: string | null;
  tagline: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  address: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;

  // Default Values
  default_values: Partial<ClientFormDefaults>;
}

/** Subset of client form fields that can be set as user defaults */
export interface ClientFormDefaults {
  blueprint_type: string;
  state: string;
  filing_status: string;
  tax_rate: number;
  max_tax_rate: number;
  tax_payment_source: string;
  constraint_type: string;
  rate_of_return: number;
  bonus_percent: number;
  baseline_comparison_rate: number;
  post_contract_rate: number;
  end_age: number;
  heir_tax_rate: number;
  surrender_years: number;
  penalty_free_percent: number;
  years_to_defer_conversion: number;
  conversion_type: string;
  protect_initial_premium: boolean;
  withdrawal_type: string;
  carrier_name: string;
  product_name: string;
}

export type UserSettingsUpdate = Partial<
  Omit<UserSettings, "id" | "user_id" | "created_at" | "updated_at">
>;
