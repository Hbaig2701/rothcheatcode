/**
 * Post-response hallucination guard for the in-app assistant.
 *
 * We've seen the bot confidently invent UI claims that don't match reality:
 *   - "Section 2 has a Roth balance field" (it doesn't)
 *   - "SSI payout age max is 70" (real range: 62-100)
 *   - "scroll past Qualified Account Value to find Roth" (no Roth field exists)
 *
 * After each assistant message is persisted, we run this against the final
 * text. Each known bad pattern returns a short label string describing the
 * suspected hallucination. The chat route inserts the labels into
 * `chat_assistant_flags` for retrospective review.
 *
 * This is intentionally a TARGETED guard — it catches specific failure
 * modes we have evidence for, not a general "did the bot invent a UI claim"
 * detector. A general detector is brittle and would either miss real bugs
 * or flag too many false positives. As new bugs surface, add patterns here.
 */

// Section labels rendered in the form. Sourced from the same
// scripts/generate-ui-map.ts output. If a Section number outside 1-9 is
// mentioned, the bot is hallucinating.
const VALID_SECTION_NUMBERS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

// Field names that DO NOT have an input in the main client form today.
// Each pair: [pattern in bot text, friendly explanation]. We match
// case-insensitively + with surrounding word boundaries.
const NONEXISTENT_FORM_FIELDS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\broth (ira |ira balance|balance) (field|input|box)\b/i,
    label: "Claimed a 'Roth IRA balance field' in the form — no such input exists in the main client form today (Section 2 has only Qualified Account Value).",
  },
  {
    pattern: /\bsection (?:2|two)[^.]{0,200}?\b(roth|taxable account)\b/i,
    label: "Claimed Section 2 contains Roth or Taxable Account inputs — Section 2 has only Qualified Account Value.",
  },
  {
    pattern: /\btaxable account(s)? (field|input|box)\b/i,
    label: "Claimed a 'Taxable Account field' in the form — no such input exists in the main client form today.",
  },
];

// Numeric range claims on SSI payout age. The real range is 62-100. Any
// other "max is N" or "minimum is N" claim near "SSI" / "Social Security
// payout" / "payout age" is suspect.
const SSI_RANGE_CLAIM = /\b(?:ssi|ss(?: payout)?|social security|payout age)[^.]{0,80}?\b(?:max(?:imum)?|min(?:imum)?|between|range)[^.]{0,30}?\b(\d{2,3})\b/gi;

export function scanAssistantTextForHallucinations(text: string): string[] {
  const flags: string[] = [];

  if (!text || text.length < 10) return flags;

  // Pattern A: "Section N" where N > 9 or N < 1.
  for (const m of text.matchAll(/\bsection\s+(\d+)\b/gi)) {
    const num = Number(m[1]);
    if (!VALID_SECTION_NUMBERS.has(num)) {
      flags.push(`Referenced "Section ${num}" — only sections 1-9 exist in the form.`);
    }
  }

  // Pattern B: non-existent form fields.
  for (const f of NONEXISTENT_FORM_FIELDS) {
    if (f.pattern.test(text)) flags.push(f.label);
  }

  // Pattern C: SSI age range claims with numbers other than 62/100.
  // We intentionally only flag when the claim looks like a UI limit
  // (the word "max" / "min" / "between" / "range" within 80 chars of
  // SSI/SS/payout age) — substantive discussions of an actual claim
  // age the client picked (e.g. "your client started at 67") aren't
  // matched because they don't include "max"/"min"/etc.
  for (const m of text.matchAll(SSI_RANGE_CLAIM)) {
    const num = Number(m[1]);
    if (num !== 62 && num !== 100) {
      flags.push(`Stated SSI/SS payout age limit of ${num} — the real range is 62-100.`);
    }
  }

  // De-dupe within the same response.
  return Array.from(new Set(flags));
}
