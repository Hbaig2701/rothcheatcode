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
 * or flag too many false positives.
 *
 * False-positive avoidance:
 *   - Section-N: skip IRC code references (followed by `(letter)` or `.digit`,
 *     or paired with IRC/tax-code context words).
 *   - Field-existence claims: skip when an explicit negation is in the
 *     immediate vicinity — the bot is correctly stating the gap, not
 *     inventing the field.
 */

// Section labels rendered in the form. Anything outside 1-9 is either an
// IRC code reference (handled separately) or a hallucination.
const VALID_SECTION_NUMBERS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

// Field-existence assertion patterns. Each entry catches the bot claiming
// a non-existent form field actually exists. The label is what shows up in
// chat_assistant_flags for human review.
const NONEXISTENT_FORM_FIELDS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\broth(?:\s+ira)?(?:\s+balance)?\s+(?:field|input|box)\b/i,
    label: "Claimed a 'Roth balance/IRA field' in the form — no such input exists in the main client form today (Section 2 has only Qualified Account Value).",
  },
  {
    pattern: /\bsection\s+(?:2|two)\b[\s\S]{0,200}?\b(?:roth|taxable account)\b/i,
    label: "Claimed Section 2 contains Roth or Taxable Account inputs — Section 2 has only Qualified Account Value.",
  },
  {
    pattern: /\btaxable\s+accounts?\s+(?:field|input|box)\b/i,
    label: "Claimed a 'Taxable Account field' in the form — no such input exists in the main client form today.",
  },
];

// Numeric range claims on SSI payout age. The real range is 62-100. Any
// other "max is N" / "min is N" / "limit is N" / "between A and B" claim
// near "SSI" / "Social Security payout" / "payout age" is suspect.
const SSI_RANGE_CLAIM = /\b(?:ssi|ss(?:\s+payout)?|social\s+security|payout\s+age)[\s\S]{0,80}?\b(?:max(?:imum)?|min(?:imum)?|between|range|limit|cap)[\s\S]{0,40}?\b(\d{2,3})\b/gi;

// Negation tokens that, when within ~40 chars BEFORE a claim pattern,
// indicate the bot is correctly explaining the field's absence rather than
// inventing it. e.g. "Section 2 does NOT have a Roth balance" should not
// trip the Section-2-Roth flag.
const NEGATION_TOKENS = /\b(not|no|n't|never|doesn't|does not|don't|do not|isn't|won't|cannot|cant|only|just|without|absent|missing|lacks?)\b/i;

// IRC tax-code context indicators. If any of these are near a "Section N"
// match, it's an IRC reference (Section 401(k), Section 199A, Section 1031,
// Section 1.401-1, etc.), NOT a form section number.
const IRC_CONTEXT = /\b(irc|internal\s+revenue\s+code|tax\s+code|statute|treas(?:ury)?\.?\s*reg|c\.f\.r|cfr|publication\s+\d|form\s+\d{4}|pub\.\s*\d+|§)\b/i;

// True if a negation token appears in the immediate context of a match —
// either ~40 chars BEFORE the match (e.g. "we don't have a Roth field") or
// INSIDE the matched span itself (e.g. "Section 2 does NOT contain Roth").
// The "inside" check is what the v1 version missed: when the negation is
// embedded in the matched phrase rather than preceding it, the v1 hadNeg
// returned false and the guard fired on a correct explanation.
function hasNegationNear(text: string, matchIndex: number, matchEnd: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 40), matchIndex);
  const inside = text.slice(matchIndex, matchEnd);
  return NEGATION_TOKENS.test(before) || NEGATION_TOKENS.test(inside);
}

function looksLikeIRCReference(text: string, matchIndex: number, sectionEnd: number): boolean {
  // Common IRC patterns:
  //   "Section 401(k)" — digit followed by ( letter
  //   "Section 199A"   — digit followed by uppercase letter
  //   "Section 1.401-1" — digit . digit
  //   "Section 1031"    — 4-digit IRC sections
  const charAfter = text[sectionEnd] ?? "";
  const next3 = text.slice(sectionEnd, sectionEnd + 4);
  if (/^\([a-z]/i.test(next3)) return true;           // 401(k)
  if (/^[A-Z]/.test(charAfter)) return true;          // 199A
  if (/^\.\d/.test(next3)) return true;               // 1.401
  if (/^-\d/.test(next3)) return true;                // 401-1
  // Surrounding context: IRC, tax code, publication, etc.
  const around = text.slice(Math.max(0, matchIndex - 80), Math.min(text.length, sectionEnd + 80));
  if (IRC_CONTEXT.test(around)) return true;
  return false;
}

export function scanAssistantTextForHallucinations(text: string): string[] {
  const flags: string[] = [];

  if (!text || text.length < 10) return flags;

  // Pattern A: "Section N" where N is outside 1-9 AND looks like a form
  // section reference (not an IRC code reference).
  for (const m of text.matchAll(/\bsection\s+(\d+)\b/gi)) {
    const num = Number(m[1]);
    if (VALID_SECTION_NUMBERS.has(num)) continue;
    const matchIdx = m.index ?? 0;
    const sectionEnd = matchIdx + m[0].length;
    if (looksLikeIRCReference(text, matchIdx, sectionEnd)) continue;
    flags.push(`Referenced "Section ${num}" — only sections 1-9 exist in the form.`);
  }

  // Pattern B: non-existent form fields. Skip when a negation is near the
  // match (either before it or inside it).
  for (const f of NONEXISTENT_FORM_FIELDS) {
    const globalPattern = new RegExp(f.pattern.source, f.pattern.flags.includes("g") ? f.pattern.flags : f.pattern.flags + "g");
    for (const m of text.matchAll(globalPattern)) {
      const idx = m.index ?? 0;
      const end = idx + m[0].length;
      if (hasNegationNear(text, idx, end)) continue;
      flags.push(f.label);
      break; // one flag per pattern is enough
    }
  }

  // Pattern C: SSI payout age range claims with numbers other than 62/100.
  for (const m of text.matchAll(SSI_RANGE_CLAIM)) {
    const num = Number(m[1]);
    if (num === 62 || num === 100) continue;
    const idx = m.index ?? 0;
    const end = idx + m[0].length;
    if (hasNegationNear(text, idx, end)) continue;
    flags.push(`Stated SSI/SS payout age limit of ${num} — the real range is 62-100.`);
  }

  // De-dupe within the same response.
  return Array.from(new Set(flags));
}
