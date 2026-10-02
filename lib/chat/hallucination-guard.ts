/**
 * Post-response hallucination guard for the in-app assistant.
 *
 * We've seen the bot confidently invent UI claims that don't match reality:
 *   - "Section 2 has a Roth balance field" (it doesn't)
 *   - "SSI payout age max is 70" (real range: 62-100)
 *   - "scroll past Qualified Account Value to find Roth" (no Roth field exists)
 *   - "IRC 72(t)(2)(A)(v) exempts conversion-tax withdrawals" (FABRICATED — no
 *     such exception exists; advisor would have given client wrong advice)
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
//
// NOTE: As of 2026-06-05, Section 2 of the client form DOES include Roth IRA
// Balance and Taxable Account Balance inputs. The historical Roth/Taxable
// hallucination patterns (which used to trip on bot claims that those fields
// existed) have been REMOVED because those claims are now true. Only patterns
// for fields that genuinely don't exist should live here.
const NONEXISTENT_FORM_FIELDS: Array<{ pattern: RegExp; label: string }> = [
  // (intentionally empty for now — the Roth/Taxable patterns shipped before
  // those inputs were added to Section 2. If new "claimed non-existent field"
  // hallucinations surface, add them here.)
];

// Numeric range claims on SSI payout age. The real range is 62-100. Any
// other "max is N" / "min is N" / "limit is N" / "between A and B" claim
// near "SSI" / "Social Security payout" / "payout age" is suspect.
// Tightened 2026-10: the 80/40-char windows spanned unrelated sentences, so an
// answer that happened to mention Social Security and later said "35% bracket"
// or "age 74 in California" was flagged as a fabricated SS age limit. Two false
// positives in 852 production messages. The window is now short and the number
// must be an AGE claim — a bare percentage or a different noun no longer counts.
const SSI_RANGE_CLAIM = /\b(?:ssi|ss(?:\s+payout)?|social\s+security|payout\s+age)[\s\S]{0,60}?\b(?:max(?:imum)?|min(?:imum)?|range|limit|cap(?:ped)?|locked|allows?)\b[\s\S]{0,30}?\b(?:age\s+)?(\d{2,3})\b(?!\s*%)/gi;

// "between A and B" framing for SSI age — catches "the platform allows
// payout ages between 62 and 85" style fabrications. Real range is 62-100.
// Flag any pair where the upper bound is not 100 (or the lower not 62).
const SSI_BETWEEN_CLAIM = /\b(?:ssi|ss\s+payout|social\s+security|payout\s+age)[\s\S]{0,80}?\bbetween\s+(\d{2})\s+and\s+(\d{2,3})\b/gi;

// Tax-code citation patterns. The bot has fabricated IRC sections that
// gave advisors penalty-triggering wrong advice. We flag ANY parenthetical-
// number IRC citation so a human can verify. Common shapes:
//   IRC 72(t)(2)(A)(v)
//   Section 72(t)
//   26 U.S.C. § 408
//   Treas. Reg. 1.401-1
//   IRC §401(k)
//   "under IRC 72(t)(2)(A)(v)" etc.
const IRC_CITATION_PATTERNS: RegExp[] = [
  // "IRC 72(t)" / "IRC § 72(t)" / "IRC Section 72(t)"
  /\bIRC\s*(?:Section\s*|§\s*)?\d{1,4}\s*\(/gi,
  // "26 U.S.C. 408" / "26 USC §72" / "26 U.S.C. § 408(d)"
  /\b26\s+U\.?S\.?C\.?\s*§?\s*\d{1,4}/gi,
  // "Treas. Reg. 1.401-1" / "Treasury Regulation 1.401"
  /\bTreas(?:ury)?\.?\s*Reg(?:ulation)?\.?\s*\d/gi,
  // "Section 72(t)(2)(A)(v)" — parenthetical letter/digit chain is the
  // strong tell. "Section 6" alone is form-section reference; "Section
  // 72(t)" is IRC.
  /\bSection\s+\d{2,4}\s*\([a-z0-9]\)/gi,
  // "§72(t)" / "§ 401(k)" — bare paragraph symbol with section number
  /§\s*\d{1,4}\s*\(/g,
  // "Section 199A" / "Section 1031" — bare IRC section number with optional
  // trailing letter, when IRC/tax-code context appears nearby. Without the
  // context check this would over-fire on every "Section 6" form reference.
  // We accept 2-4 digit section numbers (IRC sections range 1-9999) with an
  // optional single trailing letter. Validation is done in the scanner.
  /\bSection\s+(\d{2,4}[A-Z]?)\b/g,
];

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
// "only" and "just" are in NEGATION_TOKENS because they soften claims about
// form fields ("Section 2 only has..."). But for a RANGE claim they do the
// opposite — "the platform only allows ages 62 to 85" is the fabrication we
// are hunting, not a denial of it. Range patterns use this stricter set.
const DENIAL_TOKENS = /\b(not|no|n't|never|doesn't|does not|don't|do not|isn't|won't|cannot|cant|without|absent|missing|lacks?)\b/i;

function hasDenialNear(text: string, matchIndex: number, matchEnd: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 40), matchIndex);
  return DENIAL_TOKENS.test(before) || DENIAL_TOKENS.test(text.slice(matchIndex, matchEnd));
}

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


// ── Invented engine mechanisms ─────────────────────────────────────────────
// The assistant told two different advisors the engine "strategically defers
// year-1 conversions to preserve the penalty-free allowance for later years".
// No such behavior exists. Real causes are in the KB ("Why a year-1 conversion
// can be $0"); the leading one is a custom product with a 0% Year 1 Withdrawal
// Rule. Also catches the invented "Conversion Cost Payback" screen.
const INVENTED_MECHANISMS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /\b(strategically|deliberately|intentionally)\s+(defer|defers|deferring|skip|skips|skipping)\b/i,
    label: 'Claimed the engine "strategically defers/skips" conversions — no such behavior exists. See KB "Why a year-1 conversion can be $0".',
  },
  {
    pattern: /\b(preserve|save|reserve)\s+(the\s+)?(penalty[- ]free|10%)\s+(allowance|cap|limit|room)\s+for\s+(later|future|year)/i,
    label: 'Claimed the engine reserves penalty-free allowance for later years — invented mechanism.',
  },
  {
    pattern: /\bconversion\s+cost\s+payback\s+(screen|page|tab|view)\b/i,
    label: 'Referenced a "Conversion Cost Payback" screen — no such screen exists.',
  },
];

// ── Break-even described with the wrong mechanic ───────────────────────────
// Break-even = cumulative TAX paid, strategy vs baseline. It has nothing to do
// with the Roth balance growing past the taxes paid.
const BREAKEVEN_WRONG_MECHANIC =
  /\b(break[- ]?even|payback)\b[^.]{0,120}\broth\s+(ira\s+)?balance\b[^.]{0,80}\b(exceed|exceeds|surpass|surpasses|crosses|grows?\s+(large|big)\s+enough)\b/i;

// ── Federal brackets described as frozen ───────────────────────────────────
// getFederalBrackets() indexes brackets forward 3%/yr past 2026, so quoting a
// 2026 ceiling for a later year produces a phantom "overshoot".
const BRACKETS_FROZEN =
  /\bbrackets?\b[^.]{0,80}\b(are\s+not|aren.t|not)\s+(inflation[- ]?)?(indexed|adjusted)\b|\bbrackets?\s+(stay|remain|are\s+held)\s+(at|flat)\b[^.]{0,40}2026/i;

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


  // Pattern E: invented engine mechanisms / screen names.
  for (const m of INVENTED_MECHANISMS) {
    const g = new RegExp(m.pattern.source, m.pattern.flags.includes('g') ? m.pattern.flags : m.pattern.flags + 'g');
    for (const hit of text.matchAll(g)) {
      const idx = hit.index ?? 0;
      if (hasNegationNear(text, idx, idx + hit[0].length)) continue;
      flags.push(m.label);
      break;
    }
  }

  // Pattern F: break-even explained via the Roth balance rather than cumulative tax.
  {
    const hit = BREAKEVEN_WRONG_MECHANIC.exec(text);
    if (hit && !hasNegationNear(text, hit.index, hit.index + hit[0].length)) {
      flags.push('Described break-even as the Roth balance exceeding taxes paid — it is cumulative TAX paid, strategy vs baseline.');
    }
  }

  // Pattern G: claiming federal brackets are frozen at 2026 values.
  // NOTE: deliberately does NOT run hasNegationNear. For every other pattern a
  // nearby negation means the bot is correctly denying the false thing; here
  // the negation ("brackets are NOT indexed") IS the false claim.
  {
    const hit = BRACKETS_FROZEN.exec(text);
    if (hit) {
      flags.push('Claimed federal brackets are not inflation-indexed — the engine indexes them 3%/yr past 2026.');
    }
  }

  // Pattern C: SSI payout age range claims with numbers other than 62/100.
  for (const m of text.matchAll(SSI_RANGE_CLAIM)) {
    const num = Number(m[1]);
    if (num === 62 || num === 100) continue;
    const idx = m.index ?? 0;
    const end = idx + m[0].length;
    if (hasDenialNear(text, idx, end)) continue;
    flags.push(`Stated SSI/SS payout age limit of ${num} — the real range is 62-100.`);
  }

  // Pattern C2: "between A and B" framing for SSI age. Same backstop as
  // Pattern C but catches the framing where the bot says "between 62 and 85"
  // and the upper number isn't 100.
  for (const m of text.matchAll(SSI_BETWEEN_CLAIM)) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo === 62 && hi === 100) continue;
    const idx = m.index ?? 0;
    const end = idx + m[0].length;
    if (hasDenialNear(text, idx, end)) continue;
    flags.push(`Stated SSI/SS payout age range of ${lo}-${hi} — the real range is 62-100.`);
  }

  // Pattern D: tax-code citations. The bot should NEVER emit these — the
  // system prompt explicitly forbids citing IRC/USC/CFR section numbers
  // because it has fabricated nonexistent ones in the past (cost an advisor
  // wrong advice that would have triggered IRS penalties on a real client).
  // Any match here is worth flagging for human review.
  //
  // Special case for the last pattern (`Section N` with optional letter, no
  // parens): only flag when an IRC/tax-code context word is nearby AND the
  // section number isn't a form-section number (1-9). Without these checks
  // we'd over-fire on every "Section 6. Conversion" form reference.
  const seenCitationLabels = new Set<string>();
  for (let p = 0; p < IRC_CITATION_PATTERNS.length; p++) {
    const pat = IRC_CITATION_PATTERNS[p];
    const isBareSectionPattern = p === IRC_CITATION_PATTERNS.length - 1;
    for (const m of text.matchAll(pat)) {
      const idx = m.index ?? 0;
      const end = idx + m[0].length;
      if (isBareSectionPattern) {
        // m[1] is the captured section number+letter (e.g., "199A", "1031").
        // Form sections are 1-9 single digits; only flag 2-4 digit numbers.
        const sectionNum = m[1];
        const numericOnly = sectionNum.replace(/[A-Z]+$/, "");
        if (numericOnly.length < 2) continue;
        // Form sections are 1-9. A 2-digit number could still be a form
        // section in error, but the pattern already requires ≥2 digits, so
        // anything ≥10 is suspicious. The IRC context check is the gate.
        const around = text.slice(Math.max(0, idx - 100), Math.min(text.length, end + 100));
        if (!IRC_CONTEXT.test(around)) continue;
      }
      // Trim the matched snippet for the flag label so reviewers see exactly
      // what the bot wrote without having to open the full transcript.
      const snippet = m[0].slice(0, 60).trim();
      const label = `Cited a tax-code section ("${snippet}") — system prompt forbids citing IRC/USC/CFR sections by number; verify this isn't fabricated.`;
      if (seenCitationLabels.has(label)) continue;
      seenCitationLabels.add(label);
      flags.push(label);
    }
  }

  // De-dupe within the same response.
  return Array.from(new Set(flags));
}
