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

**Demand signal:** requested by Daven Sharma (re: Suzanne Marcus, ticket Jun 2026) — also blocks his related "Report data" ticket. Adjacent to other "more flexible deposit/allocation" asks (e.g. Allianz 222 legacy-only / no-income). Also Tim Wright (re: Jim, ticket Jun 30 2026): $5.15M pre-tax but only $1–2M into the annuity — currently the scenario converts against the full $5M. Workaround given: either set IRA balance to the annuity slice, or use `partial_amount` with `target_partial_amount` = annuity amount to cap total conversions while keeping the full balance's RMDs realistic.

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

---

## Explicit birth-year / RMD-start-age control

**The pitch:** Let advisors set a client's **birth year (or DOB), or override the RMD start age** directly, instead of the engine inferring it from the entered `age`.

**Why:** RMD start age is 73 (born 1951–1959) vs 75 (born 1960+) under SECURE 2.0. The engine derives birth year from `age` (`getBirthYearFromAge`), which is imprecise right at the 1959/1960 boundary — a client entered as a round age can land on the wrong side. The DOB field exists in the schema but its input section (`PersonalInfoSection`) is an **orphan** (not rendered in the live form), and DOB is auto-generated as Jan-1-of-(year−age) on save. So there's no live way to pin the exact birth year.

**What it requires:** wire a birth-year (or DOB) input into the live client form, and have the engine prefer it over age-derived birth year for RMD timing. Small — the engine already supports DOB; mostly a form/UX change + deciding precedence.

**Note:** the RMD *calculation* and all displays now correctly apply 73/75 based on the derived birth year (fixed June 2026, Lori ticket) — so this is a precision/override convenience, not a correctness gap.

**Demand signal:** Lori Avant (mtwentyone.com), Jun 22 2026 — "would be helpful to be able to edit this based on birth year."

**Estimated effort:** **1–2 days** (form field + engine precedence + tests).

---

## Tax credits input (offset tax dollar-for-dollar)

**The pitch:** Let advisors enter **tax credits** (e.g. disaster-relief carryover credits, foreign tax credits, etc.) that reduce the tax owed **dollar-for-dollar** — distinct from the `additional_deductions` field (shipped June 2026), which reduces taxable *income*. A $300K credit wipes out $300K of tax; a $300K deduction only saves marginal-rate × $300K (~$96K at 32%). So deductions are NOT a usable proxy for credits.

**What it requires:** a `tax_credits` field (cents; flat or year-by-year) + apply it in every tax-computing engine **after** the federal (and/or state) tax is computed, floored at $0, mirroring how `additional_deductions` plugs into `getEffectiveDeduction`. Since each YearlyResult stores the year's tax, the marginal "Tax on Conversion" and PDF pick it up automatically. Decide: federal-only vs federal+state, and whether unused credit carries forward across years.

**Demand signal:** Gerald Shaw (mysummitadvisors.com, re: Joseph Klink, Jun 24 2026 — $300K hurricane-relief carryover credits). Also explicitly promised in the Mark Nichols thread ("considering adding Additional Deductions and Tax Credits"). The deductions half is built; this is the other half.

**Estimated effort:** **~half a day** (mirrors the additional_deductions build: field + validation + migration + one apply-after-tax helper + UI + cache bump).

---

## Explicit withdrawal-source fallback (fair baseline-vs-strategy comparison)

**The pitch:** Make the **"Roth IRA"** and **"Traditional IRA"** withdrawal-source options fall back to the other bucket the way **"Auto"** already does, instead of drawing $0 when the named bucket is empty.

**Why:** The baseline ("do nothing") client has no Roth; the strategy client (after full conversion) has no traditional IRA. So an explicit `source: 'roth'` draws the full income on the strategy side but **$0 on the baseline** (no Roth to pull) — the baseline just compounds while the strategy spends down, throwing the strategy deeply negative. `source: 'ira'` breaks it mirror-image (strategy draws $0, balloons). The comparison is only fair when **both sides fund the same income**, which is exactly what `auto` does today. Advisors reach for "Roth IRA" precisely *because* they want to showcase tax-free income — so the most intuitive choice silently produces the most misleading chart.

**What it requires:** in `resolveWithdrawalsForYear` (`lib/calculations/utils/withdrawals.ts`), have explicit `'roth'`/`'ira'` requests fall back to the other qualified bucket when the preferred one is exhausted (same Roth-first/IRA-fallback logic Auto uses, just with the advisor's preferred bucket ordered first). Applies symmetrically in `baseline.ts` + `growth-formula.ts` (+ `formula.ts`, GI engine). Bump the cache version.

**Caveat (out of scope):** this matches **gross** income, not **net spendable** — the baseline's IRA draw is taxed, so it nets less than the strategy's tax-free Roth draw. True net-income parity (gross up the baseline withdrawal) is a bigger modeling change; this same gross-vs-net imperfection already exists in `auto` today, so the fallback fix doesn't make it worse.

**Demand signal:** Gerald Shaw (mysummitadvisors.com, re: Joseph Klink, Jun 24 2026 — "Why does taking income from ROTH ruin strategy? Any income from ROTH gives negative #s"). Told to use "Auto" as the interim workaround.

**Estimated effort:** **~half a day** (fallback ordering in one util + verify symmetry across 4 engines + cache bump + tests).

---

## RMD should fund the conversion tax (from-IRA over-distributes) — ✅ DONE (Jun 28 2026, cache v64)

**SHIPPED:** Fixed in `growth-formula.ts` + `formula.ts`. The conversion tax (paid from IRA) is now withheld from the after-tax RMD first; only the shortfall (`extraPullForTax = max(0, conversionTaxFromIRA − afterTaxForcedRmd)`) is pulled as an extra distribution and re-recognized as income. The reinvested-RMD taxable inflow is reduced by the tax withheld from it (conservation). `taxesPaidFromIRA` still displays the full conversion tax (it IS paid with IRA dollars, just out of the RMD). Cache bumped 63→64. **GI engine: assessed, no change** — its conversion phase models no RMD, and its RMD-bearing phases (legacy-hold, widow) have no conversion, so the bug can't occur there. Validation via git-stash pre/post diff (`scripts/audit-rmd-fix.ts`): from_taxable + pre-RMD-age controls **byte-identical**; from_ira+RMD cases corrected. Real client **Peter Crane** age-74 totalIRAwd $174,225→$146,937, fed tax $58,681→$49,949, legacy $3.65M→$4.03M. Symmetry harnesses (growth/strategy/baseline-modes) all green ($0 zero-conversion divergence). **Still deferred:** (a) conversion re-sizing for the penalty-free-cap/gross-down branches (conversion stays conservative — correct but not bracket-maximal); (b) voluntary-withdrawal funding (v1 funds from the forced RMD only); (c) GI doesn't model RMDs during conversion at 73+ (separate latent gap). Original spec retained below for reference.

**The pitch:** When conversion tax is paid **from the IRA** and the client has an **RMD**, the engine pulls the conversion tax as a *separate* distribution **on top of** the full RMD. It should fund the conversion tax **from the RMD first** (the IRS counts any distribution — including tax withholding — toward the RMD), pulling extra only for the shortfall.

**Verified correct (the law):** Confirmed via IRS RMD FAQs + Fidelity/Schwab + Ed Slott:
1. RMDs can't be converted; RMD must be satisfied before a conversion ("first dollars out").
2. The conversion itself does NOT count toward the RMD.
3. The **gross amount of any distribution counts toward the RMD — including the portion withheld for taxes.** So money pulled to pay the conversion tax counts toward the RMD; you don't take a separate full RMD on top of it.
Advisor (Kwanza Ellis, mysummitadvisors.com, Jun 26–27 2026) was correct; our earlier reply that the tax-funding "doesn't count" was wrong.

**Proof of the bug (verified numerically):** Age 75, ~$738K IRA → RMD $30K, fixed $100K conversion, tax from IRA. Engine pulls **$30K RMD + $100K conversion + $18,513 tax = $148,513** out of the IRA. Correct should be ~**$130K** (the $18.5K tax comes out of the $30K RMD; only the excess beyond the RMD is pulled extra, with gross-up only on that excess).

**The design:**
- `extra pull = max(0, conversionTaxFromIRA − rmdCashAvailable)` where `rmdCashAvailable = effectiveIraDistribution` (the RMD/forced distribution).
- RMD ≥ conversion tax → **no extra pull**; total out = RMD + conversion; **no gross-up** on the RMD-funded portion (don't add it to `grossNonSSIncome`).
- RMD < conversion tax → pull only the shortfall, gross-up only that shortfall.
- No RMD (pre-RMD-age conversions) → **unchanged** (rmdRequired=0 → extra pull = full tax, as today).
- rmd_treatment governs the LEFTOVER RMD after the tax is funded (unchanged semantics).

**Where it lives (the hard part):** the from-IRA conversion-tax gross-up solver — the most branch-heavy code in the engine. Touches:
- `lib/calculations/scenarios/growth-formula.ts` — conversionTaxFromIRA split (~line 711-732), grossNonSSIncome (~line 809), and the gross-down/planner branches (~355-700) + penalty-free cap interaction.
- `lib/calculations/scenarios/formula.ts` — equivalent solver.
- `lib/calculations/guaranteed-income/engine.ts` — flat-rate gross-up (conversion phase).
- Bump `PRODUCT_CONFIG_VERSION` in `app/api/clients/[id]/projections/route.ts`.

**Validation plan:** guard so ONLY from_ira + RMD + conversion cases change (everything else byte-identical); run verify-growth-symmetry / verify-strategy-symmetry / verify-baseline-modes; add RMD+conversion+from_ira cases (tax<RMD → no extra pull; tax>RMD → partial; pre-RMD-age → unchanged); confirm conversion at/after RMD age + from_taxable is unaffected.

**Interim workaround (given to advisor):** set Tax Payment Source = "External (from taxable accounts)" with RMD/cash entered as the taxable balance — models the client paying the conversion tax from the RMD, no extra pull, accurate numbers today.

**Scope note:** affects only conversions at age 73+ with tax paid from the IRA. Pre-RMD-age conversions and from-taxable cases are correct already.

**Estimated effort:** **~2–3 days, medium-high risk** (money math in the hairiest solver, ×3 engines, heavy validation). Smaller scoped v1 (growth engine, tax≤RMD common case only) ≈ 1 day but leaves some from-IRA cases unfixed.

**Demand signal:** Kwanza Ellis (mysummitadvisors.com), Jun 27 2026 — "all of the tax numbers for cases where the taxes are paid from the IRA are wrong and can't be presented to clients."

### Implementation notes (precision for the build — read before starting)

**Exact anchors in `growth-formula.ts` (line numbers as of cache v63):**
- `712` `conversionTaxBeforeSplit = federalTax + stateTax` (the marginal conversion tax)
- `717` `conversionTaxFromIRA = payTaxFromIRA ? min(taxCap, conversionTaxBeforeSplit) : 0` ← the extra pull to reduce
- `722` `conversionTaxExternal` (overflow above the penalty-free cap)
- `733` `iraAfterConversion = max(0, iraAfterDistribution − conversionAmount − conversionTaxFromIRA)` ← uses the pull
- `810` `grossNonSSIncome = conversionAmount + conversionTaxFromIRA + effectiveIraDistribution + otherIncome` ← gross-up enters income HERE; must use the reduced extra-pull
- `952-953` `rmdAttributableTax` / `afterTaxForcedRmd` (existing after-tax-RMD math to reuse)
- `1068` `taxesPaidFromIRA: conversionTaxFromIRA` (display field — keep consistent)
- `351-697` the `skipGrossDown` planner / gross-down branches (optimized/partial/fixed/full) — these SIZE the conversion assuming tax is an additional distribution.

**Cache:** bump `PRODUCT_CONFIG_VERSION` in `app/api/clients/[id]/projections/route.ts` (currently **63** → 64).

**Gross-vs-net subtlety (don't use the GROSS RMD):** the RMD also owes its own tax. Cash available to fund the *conversion* tax = the **after-tax RMD** (≈ `effectiveIraDistribution − rmdAttributableTax`), not the gross RMD. So `extraPull = max(0, conversionTaxFromIRA − afterTaxRmdAvailable)`. **Ordering gotcha:** `rmdAttributableTax` is currently computed at L952, *after* the L717 split — you'll need to compute the after-tax-RMD figure earlier (before L717) or restructure, since the extra-pull decision happens at L717.

**Conversion re-sizing caveat:** for the common case (no penalty-free cap; optimized fills to a bracket; fixed is a flat $) the conversion AMOUNT is unaffected — only the tax pull / gross income / IRA balance change, so a post-split subtraction is correct. For the penalty-free-cap + gross-down branches (`skipGrossDown` paths), the conversion was sized so conv+tax fits the cap; once the RMD funds the tax there's more room, so the conversion is *conservatively small*. Decide for v1: correct the distribution/tax only (conversion may stay conservative) vs also re-size. Recommend v1 = correct distribution/tax; note the conservative sizing.

**Voluntary-withdrawal decision:** `effectiveIraDistribution = iraWithdrawal (voluntary) + forcedRmdShortfall`. Voluntary pulls also count toward the RMD and provide cash, but they're the client's chosen spending. v1 recommendation: fund the conversion tax from the **RMD portion only** (`forcedRmdShortfall`/`rmdRequired`, after-tax), NOT voluntary — Kwanza's cases have no voluntary withdrawal. Flag voluntary as a follow-up.

**Repro / test cases:**
- Synthetic: age 75, IRA $738,000 → RMD ≈ $30K, `conversion_type:'fixed_amount'` $100K, `tax_payment_source:'from_ira'`, `taxable_accounts:0`. Today: totalIRAWithdrawal ≈ $148,513. Target: ≈ $130K (no extra pull; RMD covers the ~$18.5K tax).
- Real: Peter Crane (Kwanza's, growth, age 74, $900K) and the Klink test client (`aced955f-...`).
- Harnesses: `scripts/verify-growth-symmetry.ts`, `verify-strategy-symmetry.ts`, `verify-baseline-modes.ts`. Reuse the **with/without comparison** harness pattern from the tax-credits audit (run each scenario at `from_ira` pre-fix vs post-fix; assert pre-RMD-age + from_taxable + no-RMD cases are byte-identical; assert from_ira+RMD cases drop the extra pull).

**Display fields to keep consistent after the change:** `taxesPaidFromIRA`, `taxesPaidExternally`, `totalIRAWithdrawal` (= conversion + tax-from-IRA + effectiveIraDistribution), `federalTaxOnConversions`, `federalTaxOnIRAWithdrawal`.

**Repo context:** engine is in CENTS everywhere. RMD start age 73/75 via `getClientRMDStartAge`. Run `tsc --noEmit` before commit (excludes only the pre-existing untracked `scripts/audit-athene-agility-10.ts` error). No localhost — push to Vercel; Supabase migrations need manual SQL apply (no DDL via service role).

---

## GI do-nothing baseline should take pre-income RMDs (normal income mode) — DEFERRED (validation-gated)

**The pitch:** The GI engine's do-nothing BASELINE (`runGIBaselineScenario`) only forces RMDs in the pre-income waiting/deferral phases when `gi_legacy_mode` is on. In NORMAL income mode, a 73+ client's baseline takes NO RMDs until GI income starts — so the do-nothing side dodges years of RMD tax, overstating do-nothing wealth and understating the Roth strategy's advantage. (Audit finding, June 2026. Affects GI baselines with pre-income years at 73+.)

**Why it's DEFERRED, not shipped:** Ungating the two baseline RMD blocks (waiting ~L1336, deferral ~L1693 — change `if (client.gi_legacy_mode && ...)` → `if (...)`) is a one-line-each change, BUT the deferral-phase RMD applies a **pro-rata benefit-base / death-benefit draw-down** (carrier rule, `productData.benefitBaseDrawsDown`) and lowers the eventual income-base, which then ripples through income sizing and terminal legacy. On a git-stash before/after across the 20 real GI clients this swung baseline legacy by **+$15K to +$39K for most but −$457K for Mark Aviles** — i.e. large, carrier-rule-sensitive, and direction-inconsistent. Shipping that without checking it to the dollar against carrier illustrations would violate the "validate money math" rule.

**What it requires:** validate the deferral-phase RMD + benefit-base interaction against real carrier illustrations (the Allianz 222+ / Athene Agility / Performance Elite cases already in hand — see the David Abreu legacy work). Confirm: (1) whether carriers actually draw the benefit base down pro-rata on an RMD vs let it roll up untouched (product-specific — `benefitBaseDrawsDown` must be correct per product); (2) income re-sizing after a reduced base; (3) conservation. Then ungate both blocks + bump cache.

**Already shipped (the safe half):** the GI STRATEGY conversion phase now recognizes RMDs for 73+ clients (stops illegally converting RMD dollars, taxes them marginally, routes after-tax to taxable, applies RMD-funds-conversion-tax). That half is pre-annuity (plain Traditional IRA — no benefit-base interaction), validated to small conservation-holding changes (7 affected clients, strategy-side only; baseline untouched). v64.

**Demand signal:** ~7 GI clients currently convert through age 73+ (Roy Spruyt, Daniel Rick, Mark Aviles, Laren Stover ×3, Julian Hutchins). The strategy half is fixed for them; the baseline half makes the comparison fully fair.

**Estimated effort:** ~1 day once a carrier illustration with pre-income RMDs is available to validate against; low LOC, high validation burden.

---

## "Conversions Complete" wording when conversions actually STALLED (no bracket room)

**The pitch:** Story Mode (`lib/calculations/story-generator.ts`) computes `totalConversionYears = years.filter(y => y.conversionAmount > 0).length` and headlines the last conversion year **"Conversions Complete"** with "Over N years, you converted $X to Roth." But conversions stop for **two very different reasons**: (a) the IRA is actually emptied/the goal is met, or (b) the client's forced income (SS + RMDs) grows past the target bracket ceiling, leaving **zero room** — so the optimizer converts $0 and "completes" with most of the IRA still un-converted. The copy reads as success in both cases.

**Why it confuses advisors:** lowering the target bracket makes the strategy STALL EARLIER, which the report presents as finishing FASTER. Tim Wright (re: Jim, ticket Jun 30 2026): at **24%** Jim converts $7.15M over 28 years (IRA → $1.6M); at **22%** the model says "complete in 8 years" but only $627K ever converts and the IRA balloons to **$9.05M** (RMD/SS torpedo closes the 22% room once SS starts at 67 + RMDs at 75). "Complete in 8 years" looks like the better/efficient outcome when it's actually the strategy failing to run. Correct engine math — misleading label.

**What it requires (display-only, no engine change):** distinguish the two end-states. If the final-conversion-year IRA balance is still material (e.g. > a few % of starting balance, or RMDs are now forcing distributions the conversion can't touch), say something like **"Conversions stopped — your income now fills the {target}% bracket, so there's no room left to convert (≈$X remains in the IRA and will be drawn down as RMDs)"** instead of "Conversions Complete." Optionally surface a one-liner nudge: a higher target bracket would let the strategy keep converting. Same data already on `YearlyResult` (`traditionalBalance`, `rmdAmount`, `conversionAmount`).

**Demand signal:** Tim Wright (Jun 30 2026). Latent for every high-guaranteed-income client whose target bracket is below where their SS+RMD income lands.

**Estimated effort:** ~0.5 day (Story Mode copy branch + a "stalled vs emptied" helper; no engine math).

---

## Net (after-tax) income-target withdrawals — per-scenario gross-up

**The pitch:** Section 8 withdrawals take a single GROSS dollar amount, shared across baseline and strategy. Advisors think in AFTER-TAX income ("the client needs $70K/yr to live on"). Today the same gross $70K comes out of both sides — the do-nothing IRA pull is taxable (client nets ~$54K) while the Roth pull is tax-free (nets $70K), and you can't set different amounts per scenario (source "Auto" shares the number; grossing up the baseline also over-withdraws the Roth). So the report UNDERSTATES the do-nothing depletion: in reality the client would pull MORE gross from the taxable IRA to net their target, draining it faster — which favors the Roth. Gerald Shaw (Bo Cline, Jul 2 2026): "wouldn't it be more accurate to show net rather than gross… the Baseline would draw down faster and favor the conversion if the withdrawals were after-tax?" He's right.

**What it requires:** a per-year "net income target" mode on the withdrawal schedule — the engine solves each scenario independently for the GROSS pull that nets the requested after-tax amount (baseline grosses up for the marginal tax on the IRA distribution; strategy pulls the target straight from the tax-free Roth). Needs: a toggle on the withdrawals table (Gross vs Net/after-tax), a per-scenario solver (iterate gross → tax → net like the from-IRA conversion-tax gross-up already does), and clear labeling on the PDF ("after-tax income $X"). Baseline and strategy would show DIFFERENT gross Dist IRA / Dist Roth for the same net income — that's the point.

**Demand signal:** Gerald Shaw (Jul 2 2026), and latent for every "income + legacy" client (retirees drawing living expenses from the accounts). The gross-only limitation also produced a bad support back-and-forth (my own wrong "just bump it to $85-90K" suggestion, which the shared-schedule breaks).

**Estimated effort:** ~1.5–2 days (per-scenario net→gross solver reusing the existing gross-up iteration, a schedule toggle, PDF/label updates). Display of gross withdrawals is now correct (Dist IRA/Dist Roth fix, Jul 2 2026) — this builds the net mode on top.
