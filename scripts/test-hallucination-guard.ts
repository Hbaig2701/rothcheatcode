// Smoke test for lib/chat/hallucination-guard.ts.
// Asserts each pattern flags real bot hallucinations from chat history
// AND does NOT flag the negated / IRC-context counterparts.
import { scanAssistantTextForHallucinations } from "../lib/chat/hallucination-guard";

const cases: Array<{ name: string; text: string; expectFlags: boolean }> = [
  // ===== Real bug captures (must flag) =====
  // Removed 2026-06-05: "Section 2 has Roth balance field" used to be a
  // hallucination because Section 2 only had Qualified Account Value. Now
  // Section 2 also has Roth IRA Balance + Taxable Account Balance inputs,
  // so the formerly-flagged claim is true. See NONEXISTENT_FORM_FIELDS
  // comment in hallucination-guard.ts for the rationale.
  {
    name: "OK: Section 2 Roth claim (NOW TRUE after 2026-06-05 form update)",
    text: "Section \"2. Current Account Data\" of the client form has a Roth balance field. That's where you enter the $600K.",
    expectFlags: false,
  },
  {
    name: "BUG: SSI max 70 (with SSI keyword in same message)",
    text: "The SSI payout age has a maximum of 70 in this version of the platform.",
    expectFlags: true,
  },
  // NOTE: a context-free version of this same bug ("the field has a maximum
  // of 70" with no SSI keyword in the assistant text) cannot be caught by a
  // single-message scan — the SSI keyword was in the USER's prior turn. We
  // accept that miss for now; the trade-off of false positives across all
  // "max is N" claims project-wide is too high.
  {
    name: "BUG: Section 10 doesn't exist",
    text: "Go to Section 10 of the client form to set the conversion bracket.",
    expectFlags: true,
  },

  // ===== False positives the v1 guard would have tripped =====
  {
    name: "OK: Section 2 explicitly negated (bot correctly explaining)",
    text: "Section 2 does NOT have a Roth balance field. It only contains the Qualified Account Value input.",
    expectFlags: false,
  },
  // Policy change (after Chat 1 incident, 2026-06-04): the bot must NEVER
  // cite tax-code sections by number — it has fabricated nonexistent
  // citations that would have led to client penalties. Even legitimate
  // section names (401(k), 199A, 1031) are flagged for human review, since
  // the cost of a fabricated cite slipping through is higher than the cost
  // of reviewing a real one.
  {
    name: "FLAG: IRC Section 401(k) reference (policy: no tax-code cites at all)",
    text: "Under Section 401(k) of the tax code, qualified retirement accounts grow tax-deferred.",
    expectFlags: true,
  },
  {
    name: "FLAG: IRC Section 199A reference (policy: no tax-code cites at all)",
    text: "The QBI deduction in Section 199A of the tax code applies to pass-through entities.",
    expectFlags: true,
  },
  {
    name: "FLAG: IRC Section 1031 with IRC keyword (policy: no tax-code cites)",
    text: "A like-kind exchange under IRC Section 1031 lets you defer the capital gain.",
    expectFlags: true,
  },
  // The specific fabrication that triggered the policy change.
  {
    name: "FLAG: fabricated IRC 72(t)(2)(A)(v) for conversion tax payment",
    text: "Dollars pulled from the IRA to PAY the conversion tax are treated as a payment of taxes owed, which is also exempt from the 10% penalty under IRC 72(t)(2)(A)(v) - qualified distributions for taxes.",
    expectFlags: true,
  },
  {
    name: "FLAG: 26 U.S.C. style citation",
    text: "This is governed by 26 U.S.C. § 408(d), which covers IRA distributions.",
    expectFlags: true,
  },
  {
    name: "FLAG: 'between 62 and 85' SSI range fabrication",
    text: "The spouse's Social Security payout age must be between 62 and 85.",
    expectFlags: true,
  },
  {
    name: "OK: SSI claim age range correctly stated as 62 to 100",
    text: "The platform allows SS payout ages between 62 and 100, inclusive.",
    expectFlags: false,
  },
  {
    name: "OK: SS claim age statement that isn't a UI limit",
    text: "Your client started Social Security at 67, which is their Full Retirement Age.",
    expectFlags: false,
  },
  {
    name: "OK: SS minimum claim age (62 is whitelisted)",
    text: "Social Security has a minimum claim age of 62 set by SSA rules.",
    expectFlags: false,
  },
];

let pass = 0;
let fail = 0;
for (const c of cases) {
  const flags = scanAssistantTextForHallucinations(c.text);
  const got = flags.length > 0;
  const ok = got === c.expectFlags;
  if (ok) {
    pass++;
    console.log(`  PASS  ${c.name}  ${got ? `[${flags.length} flag(s)]` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${c.name}`);
    console.log(`        expected ${c.expectFlags ? "flags" : "no flags"}, got ${flags.length}: ${JSON.stringify(flags)}`);
  }
}
console.log(`\n${pass}/${pass + fail} cases pass`);
if (fail > 0) process.exit(1);
