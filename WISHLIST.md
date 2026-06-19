# Wishlist

Internal backlog of ideas we've discussed but aren't actively building. Not a roadmap — just a parking lot so nothing gets lost. Move items out to `.planning/` when we decide to pick them up.

---

## AI Assistant Chat for Advisors

**The pitch:** Advisors struggle with theory and the "why" behind the numbers. Today they ping Hamza, who pings Claude. An in-app chat would let them self-serve.

**Two tiers:**

### Tier 1 — Generic (theory chat)
- Scope: Roth conversion theory, baseline-vs-strategy methodology, Growth FIA vs GI product types, IRMAA mechanics, 4-phase GI model, early-withdrawal penalty rules, etc.
- Build: Claude API + system prompt loaded with curated methodology docs (`/docs/methodology/*.md`).
- Knowledge base discipline: every feature PR must update the relevant methodology doc — that's the only thing that keeps it from drifting.
- With Claude's 1M context, skip RAG for V1. Just concatenate docs into the system prompt.
- Estimated effort: **3–5 days** for a solid V1.
- Cost: ~$0.01–0.05 per message at Sonnet pricing.

### Tier 2 — Specific (client-aware)
- Builds on Tier 1. Adds tool calls over Supabase: `getClient`, `getProjection`, `explainYear(id, year)`, `whyThisConversionSize`, etc.
- Advisor asks "why is the 2028 conversion $87K?" — the model pulls real numbers via tools, doesn't hallucinate dollar figures.
- Supabase RLS handles auth so advisors only see their own clients.
- Estimated effort: **1–2 weeks on top of Tier 1**.

**Risks to design around:**
1. Hallucination on tax rules — mitigate by citing the methodology doc or actual engine output, not free-recall.
2. Liability ("the AI said I could do X") — persistent disclaimer + "confirm with a tax professional" framing.
3. Knowledge-base drift — this is a process problem. Add "update methodology doc" to the definition-of-done.

**Recommended path:** Ship Tier 1 first, measure usage, then layer Tier 2 on top if advisors actually use it.

---

## Partial Annuity Deposit (split IRA: annuity + remaining tax-deferred IRA)

**The pitch:** Advisors want to put only *part* of a client's IRA into the annuity and leave the rest in a **tax-deferred IRA** they keep converting/withdrawing from. Today the annuity strategy assumes the **entire** qualified balance is the annuity premium — there's no field to deposit only, say, $500K and hold the remainder back.

**Why AUM isn't the answer:** the only existing carve-out is the AUM bucket, but by design (`lib/calculations/scenarios/aum.ts`) it pulls that slice *out* of the IRA, taxes it at ordinary rates, and lands it in a **taxable** brokerage. Advisors who want the remainder to stay **tax-deferred** (no immediate tax, still subject to RMDs, still convertible) have no option.

**What it requires (why it's not a quick fix):** a new third bucket — a *remaining tax-deferred IRA* that runs alongside the annuity with its own:
- growth, RMDs (age 73/75), and ordinary-income tax on distributions,
- Roth conversions sourced from it,
- correct baseline-vs-strategy accounting so the comparison stays fair,
- a "premium / amount into annuity" input distinct from "total IRA balance."

Touches the conversion engine, RMD logic, and the baseline comparator — needs design + careful testing, not a patch.

**Today's workaround:** set the client's IRA balance to just the amount going into the annuity (e.g. $500K) to illustrate the annuity + conversion strategy on that slice; the remaining IRA is shown separately, not blended into the same projection.

**Demand signal:** requested by Daven Sharma (re: Suzanne Marcus, ticket Jun 2026) — also blocks his related "Report data" ticket. Adjacent to other "more flexible deposit/allocation" asks (e.g. Allianz 222 legacy-only / no-income).

**Estimated effort:** **1–2 weeks** (new engine bucket + UI inputs + baseline accounting + tests).

---

## SS-taxation & IRMAA cost breakout on the report/PDF

**The pitch:** Advisors want to show the client the *cost* of (a) Social Security being taxed and (b) IRMAA Medicare surcharges as their own line items. Today neither is itemized: IRMAA is only rolled into the **"Total Costs (Taxes + IRMAA)"** line on the Legacy/Wealth page and folded into the **"Net (After-Tax)"** income columns; SS taxation isn't separated at all (the income tables show **"Taxable SS"** — the *amount* of SS subject to tax — but never the tax *dollars* attributable to it, which are blended into total federal tax).

**What it requires (mostly display, data already exists):** the engine already tracks `irmaaSurcharge` and `taxableSS` per year (`YearlyResult`), so this is largely a reporting/template change in `app/api/generate-pdf/route.ts` + `templates/pdf-template.html` (and mirror in the dashboard):
- a standalone **IRMAA** line/column (shows $0 when MAGI is under the threshold, real surcharges when not),
- an **"estimated tax attributable to SS"** figure per year (marginal: tax with vs without the taxable-SS portion — same pattern as `marginal-conversion-tax.ts` / `marginal-rmd-tax.ts`),
- optionally a **Baseline vs Strategy** comparison of both, to show the conversion reduces future SS taxation / IRMAA.

**Scope to confirm with requester:** which of the three above they actually want — they read differently and build differently.

**Note:** for low-income clients IRMAA is genuinely $0 (MAGI never crosses ~$106K single / ~$212K MFJ), so a standalone IRMAA line will legitimately show zeros for many clients — that's correct, not a gap.

**Demand signal:** requested by Jorge L. Tola (re: Dale Williams, ticket Jun 19 2026 — "SS & IRMMA"). Dale's own IRMAA is $0 (single, FL, 10–12% bracket), so his report has nothing to show; the ask is really about higher-income clients and clearer itemization.

**Estimated effort:** **2–4 days** (reporting/template + a marginal-SS-tax helper + tests; no engine-math changes).
