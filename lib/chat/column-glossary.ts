/**
 * Year-by-year table column glossary for the chat assistant.
 *
 * Generated from lib/table-columns/column-definitions.ts — the SAME registry the
 * report table renders from — so the assistant's understanding of every column
 * (what it means, its beginning- vs end-of-year timing, how it's derived) can
 * never drift from what the advisor sees on screen.
 *
 * WHY THIS EXISTS: the assistant already gets column VALUES via the
 * get_year_breakdown tool, but it never received the column DEFINITIONS — so it
 * guessed how each number is computed (e.g. it reconstructed "Roth Growth" as
 * partial-midyear growth on the opening balance, when the real rule is
 * rate × the balance AFTER that year's conversion). This block gives it the
 * authoritative derivation for every column so it explains — not invents — them.
 */
import { COLUMN_DEFINITIONS, type ColumnCategory } from "@/lib/table-columns/column-definitions";

const CATEGORY_ORDER: ColumnCategory[] = [
  "core",
  "balances",
  "growth",
  "distributions",
  "income",
  "taxes",
  "irmaa",
  "product",
  "gi-income",
];

const CATEGORY_LABEL: Record<ColumnCategory, string> = {
  core: "Core (row identity)",
  balances: "Account balances",
  growth: "Growth / interest (for the year)",
  distributions: "Distributions (for the year)",
  income: "Income (for the year)",
  taxes: "Taxes (for the year)",
  irmaa: "IRMAA / Medicare",
  product: "Product (annuity)",
  "gi-income": "Guaranteed income (GI products)",
};

const PREAMBLE = `## Year-by-year projection table — how to read EVERY column

Each report has a year-by-year table: one row per calendar year, shown for BOTH the
baseline ("do nothing" — keep the Traditional IRA) and the strategy (Roth conversions,
or the annuity). When an advisor references any number, call \`get_year_breakdown\` for
that year and read the value straight off the matching column label — then use the
glossary below to explain HOW it's derived. Never reconstruct or estimate a number the
tool already returns.

TIMING — beginning-of-year vs end-of-year (this trips advisors up, so be explicit):
- Columns whose label ends in "BOY" are BEGINNING-of-year: the balance BEFORE that
  year's conversions, distributions, and growth.
- The three core account balances are labeled with "(EOY)" — "Traditional IRA (EOY)",
  "Roth IRA (EOY)", "Taxable Account (EOY)" — to make the pairing with their BOY twin
  explicit. The other balance columns ("Net Worth", "Accumulation Value", "AUM Bucket",
  "Surrender Value", "Income Benefit Base") are ALSO end-of-year even without the
  suffix. Rule of thumb: a balance column is end-of-year unless its label says "BOY".
- Growth, tax, income, distribution, RMD, conversion, and fee columns are AMOUNTS FOR
  that year (flows during the year), not balances.

KEY DERIVATION (the single most-asked one — get this right):
- "Roth Growth" = Rate of Return × the Roth balance AFTER that year's conversion. A
  conversion lands in the Roth FIRST, THEN growth is credited on the larger balance —
  so Roth Growth is bigger than (rate × Roth BOY). Worked example: Roth BOY $205,194 +
  a $197,523 conversion = $402,717, × 7% = $28,190 of Roth Growth (NOT 7% of $205,194).
- "Traditional Growth" = Rate of Return × the Traditional balance AFTER that year's
  RMDs/conversions leave it.
- Reconcile any account: EOY balance = BOY + (money in: conversions/deposits) −
  (money out: distributions/withdrawals/tax) + growth for the year.

Column reference (exact on-screen label → meaning), grouped by section:`;

/**
 * Build the glossary text from the live column registry. Deterministic (same
 * output every call), so it sits inside the cached system-prompt prefix.
 */
export function buildColumnGlossary(): string {
  const byCategory = new Map<ColumnCategory, string[]>();
  for (const col of COLUMN_DEFINITIONS) {
    if (!col.description) continue; // skip self-evident columns (Year, Age)
    const line = `- **${col.label}**: ${col.description}`;
    const list = byCategory.get(col.category) ?? [];
    list.push(line);
    byCategory.set(col.category, list);
  }

  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const lines = byCategory.get(cat);
    if (!lines || lines.length === 0) continue;
    sections.push(`### ${CATEGORY_LABEL[cat]}\n${lines.join("\n")}`);
  }

  return `${PREAMBLE}\n\n${sections.join("\n\n")}`;
}
