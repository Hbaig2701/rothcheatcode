// Client type matching Supabase schema
export interface Client {
  id: string;
  user_id: string;
  name: string;
  date_of_birth: string; // ISO date string YYYY-MM-DD
  state: string; // 2-letter state code
  filing_status: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household";
  created_at: string;
  updated_at: string;
}

// For creating a new client (no id, timestamps auto-generated)
export type ClientInsert = Omit<Client, "id" | "user_id" | "created_at" | "updated_at">;

// For updating a client (all fields optional except id)
export type ClientUpdate = Partial<ClientInsert>;
