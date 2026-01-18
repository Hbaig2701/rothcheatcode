// Client type matching Supabase schema (all 28 fields)
export interface Client {
  // System fields
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  // Personal Information (6 fields)
  name: string;
  date_of_birth: string; // ISO date string YYYY-MM-DD
  state: string; // 2-letter state code
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
}

// For creating a new client - omit system fields, all 28 required/optional as schema defines
export type ClientInsert = Omit<Client, "id" | "user_id" | "created_at" | "updated_at">;

// For updating a client - all fields optional
export type ClientUpdate = Partial<ClientInsert>;
