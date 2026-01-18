import { z } from "zod";

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
