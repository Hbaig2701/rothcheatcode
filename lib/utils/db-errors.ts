// Translate raw Postgres errors into messages an advisor can actually read.
// Without this, the form surfaces strings like
//   `new row for relation "clients" violates check constraint "clients_spouse_ssi_payout_age_check"`
// straight from PostgREST — which is what Greg Stopp saw on 2026-06-01 for
// Dr. Michael Policar's spouse before we raised the cap to 100.

type PostgresLikeError = {
  code?: string;
  message?: string;
};

// Known check-constraint names → user-facing copy. Keep these in sync with
// the migration that defines the constraint.
const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  clients_spouse_ssi_payout_age_check:
    "Spouse Social Security payout age must be between 62 and 100. If the spouse is already claiming, enter the age they started; if unsure, use their Full Retirement Age (typically 67).",
  clients_ssi_payout_age_check:
    "Social Security payout age must be between 62 and 100. If the client is already claiming, enter the age they started; if unsure, use their Full Retirement Age (typically 67).",
  clients_penalty_free_scope_check:
    "Penalty-free scope must be either 'tax_only' or 'all_distributions'.",
};

export function translateDbError(error: PostgresLikeError | null | undefined): string {
  if (!error) return "We couldn't save this client. Please try again.";

  const raw = error.message ?? "";

  // 23514 = check_violation. Try to extract the constraint name and map it.
  if (error.code === "23514") {
    const match = raw.match(/check constraint "([^"]+)"/);
    const name = match?.[1];
    if (name && CHECK_CONSTRAINT_MESSAGES[name]) {
      return CHECK_CONSTRAINT_MESSAGES[name];
    }
    return "One of the values in this form is outside the allowed range. Please review the highlighted fields and try again.";
  }

  // 23502 = not_null_violation: a required column was empty.
  if (error.code === "23502") {
    const match = raw.match(/column "([^"]+)"/);
    return match
      ? `The "${match[1].replace(/_/g, " ")}" field is required.`
      : "A required field is missing. Please fill in all required fields and try again.";
  }

  // 23505 = unique_violation: duplicate of an existing record.
  if (error.code === "23505") {
    return "A record with these details already exists.";
  }

  // 23503 = foreign_key_violation.
  if (error.code === "23503") {
    return "This record references something that no longer exists. Please refresh the page and try again.";
  }

  // If the message looks safe (no raw SQL identifiers), pass it through;
  // otherwise return a generic one so we never leak constraint names again.
  if (/violates|constraint|relation "/.test(raw)) {
    return "We couldn't save this client. Please review the form and try again.";
  }
  return raw || "We couldn't save this client. Please try again.";
}
