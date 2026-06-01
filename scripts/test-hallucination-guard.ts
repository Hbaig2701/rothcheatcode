// Smoke test for lib/chat/hallucination-guard.ts.
// Asserts each pattern flags real bot hallucinations from chat history
// AND does NOT flag the negated / IRC-context counterparts.
import { scanAssistantTextForHallucinations } from "../lib/chat/hallucination-guard";

const cases: Array<{ name: string; text: string; expectFlags: boolean }> = [
  // ===== Real bug captures (must flag) =====
  {
    name: "BUG: Section 2 has Roth balance field",
    text: "Section \"2. Current Account Data\" of the client form has a Roth balance field. That's where you enter the $600K.",
    expectFlags: true,
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
  {
    name: "OK: IRC Section 401(k) reference",
    text: "Under Section 401(k) of the tax code, qualified retirement accounts grow tax-deferred.",
    expectFlags: false,
  },
  {
    name: "OK: IRC Section 199A reference",
    text: "The QBI deduction in Section 199A applies to pass-through entities.",
    expectFlags: false,
  },
  {
    name: "OK: IRC Section 1031 with IRC keyword",
    text: "A like-kind exchange under IRC Section 1031 lets you defer the capital gain.",
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
