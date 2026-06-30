# Engine Audit — Agent Handoff (2026-06-30)

Self-contained handoff for the next AI agent. Pairs with the detailed ledger
**`lib/calculations/__tests__/AUDIT.md`** (per-finding root cause/repro/fix). Read
both. This file = orientation + status + what to do next.

## What this was
A comprehensive audit of the retirement-calculation engines + every surface that
displays their numbers (report tables, adjustable table, story mode, chat, PDF,
dashboard, charts). Goal: no advisor-facing discrepancies; numbers correct vs
theory, not just internally consistent. Triggered because advisors kept finding
wrong numbers and prior audits missed them.

## TL;DR status
- **Fixed + PUSHED to `main` (production):** F1, F2, F2-GI, F5, F6, F7, F9, F10,
  F11, F12, F13. (main = prod, Vercel auto-deploys. Cache bumped to v69 for the
  engine fixes so projections recompute.)
- **Found + documented, NOT fixed (need dedicated work):** F8 (carrier confirm),
  F14 (product decision), **F15/F16/F17 (GI engine — the big ones)**.
- **Standing regression suite built + committed:** `npm run test:audit` (+ the
  read-only `npm run test:audit:realdata`). 22 files under
  `lib/calculations/__tests__/audit/`. All green.

## Commits pushed this session (newest last)
```
076527b  v69: engine F6/F7 + display F1/F2/F2-GI/F9/F10/F11/F12 + audit suite (cache bump)
9e4caea  F12 in the client-facing PDF
5ac5c93  F13 dashboard "Legacy Protected" per-client heir rate
c475834  F15 CORRECTED to a money bug (was mislabeled display-only)
afcd610  F16 GI income-phase federalTax=$0
71209fd  F17 (P0) GI Roth annuity heir-taxed at 40%
```
Working tree: only my changes were staged; the user's untracked `scripts/*.ts`
WIP and the pre-existing `scripts/audit-athene-agility-10.ts` (1 tsc error,
untracked → not deployed) were left alone.

## Findings table
Severity: P0 wrong-money-headline · P1 advisor-facing wrong number · P2 minor · SPEC needs decision.

| ID | Where | What | Sev | Status |
|----|-------|------|-----|--------|
| F1 | year-over-year-tables.tsx | "Legacy to Heirs" hardcoded 40% heir rate | P1 | ✅ pushed |
| F2 | year-over-year-tables.tsx | AGI/TaxableIncome re-derived, **omit taxable SS** → now read engine fields | P1 | ✅ pushed |
| F2-GI | gi-year-over-year-tables.tsx | same + over-counted tax-free GI in MAGI/IRMAA | P1 | ✅ pushed |
| F5 | report-fixtures.test.ts | golden test red since v64–v67 (stale locks) → re-locked 51/51 | P0(test) | ✅ pushed |
| F6 | formula.ts + growth-formula.ts | optimized/partial + from-IRA under-converts at RMD age (reserves bracket room the RMD funds) ~$0.5M lifetime | P1 | ✅ pushed |
| F7 | analysis/widow-penalty.ts | inflated brackets but froze deduction at 2026 → widow penalty overstated future years | P1 | ✅ pushed |
| F8 | guaranteed-income/engine.ts:809 | GI tiered roll-up credits top tier 1 yr short (`deferralYear = age-purchaseAge+1`) | P1 | 🔎 NEEDS CARRIER ILLUSTRATION |
| F9 | lib/chat/tools.ts | chat assistant hardcoded 40% heir rate (live) | P1 | ✅ pushed |
| F10 | story-generator.ts | story "Tax on Conversion" diverged from table/PDF for from-IRA | P1 | ✅ pushed |
| F11 | lib/table-columns/column-definitions.ts | formatters didn't guard NaN/Infinity (+`checkFinite` invariant added) | P2 | ✅ pushed |
| F12 | both report tables **+ generate-pdf/route.ts** | IRMAA tier returned "Tier 1" for $0 surcharge → labeled non-IRMAA 65+ clients (most retirees) as Tier 1 | P1 | ✅ pushed |
| F13 | dashboard-metrics.ts | "Legacy Protected" flat 40% → per-client; `determineBracket` dead 2026-threshold fallback (latent) | P2/P3 | ✅ pushed (bracket: latent) |
| F14 | growth vs GI tables | "Net Income" defined differently (growth subtracts all tax incl conversion; GI shows net living income) | SPEC | 🔎 decision |
| **F15** | **guaranteed-income/engine.ts ~408** | **GI taxes conversions FLAT conversionBracket% (24%) not progressive (~19-20%); wrong tax DEDUCTED from balance → every GI conversion client's net worth off (+$34K to −$23K/yr, ~$133K lifetime)** | **P1 money** | 🔎 dedicated fix |
| **F16** | **guaranteed-income/engine.ts:1084** | **GI strategy income-phase `federalTax: 0` ignores taxable pension/other income (engine computes taxableIncome 1 line up then discards it) → tax-savings headline overstated** | **P1** | 🔎 dedicated fix |
| **F17** | **guaranteed-income/engine.ts:84,915,1092 + all GI display** | **GI strategy's tax-FREE Roth annuity stored in `traditionalBalance` → heir-taxed 40% across giMetrics/dashboard/summary/table/PDF → erases the GI Roth legacy advantage (~$1.2M understated in legacy mode)** | **P0** | 🔎 dedicated fix |

Verified-correct (NOT bugs — already investigated, don't re-flag): post-surrender
crediting rate ≠ baseline; rider fees break symmetry; bracket + senior-deduction
inflation indexing (3%/yr); the upfront-bonus year-1 balance; AUM tax-drag;
compound growth; income-breakdown column sums; chart y-axis; chart-vs-table
legacy (taxable≥0); GI IRMAA 2-yr lookback; cache invalidation (complete except
`ss_start_age`/`heir_bracket` fallbacks, P2). See AUDIT.md "Investigated, NOT bugs".

## ⭐ TOP PRIORITY NEXT WORK: dedicated GI-engine rework (F15+F16+F17)
The guaranteed-income engine is the least trustworthy part of the system. F15/F16/
F17 are interrelated and need ONE carefully-validated PR (NOT bundled with anything
else, high blast radius — every GI client's numbers move):
1. **Tax (F15+F16):** replace the flat-rate conversion tax and the income-phase
   `federalTax:0` with the standard engine's progressive, SS-torpedo-aware marginal
   method (`computeTaxableIncomeWithSS` + `calculateFederalTax`, tax_with − tax_without,
   on the RMD/SS-inclusive base). The baseline GI path already does this correctly —
   mirror it. Then `federalTax`/`totalTax` become the real liability everywhere.
2. **Roth legacy (F17):** track the strategy's Roth annuity in `rothBalance` (or a
   Roth flag the legacy calc + all 5 display surfaces honor) so heir tax = $0 on it;
   baseline (traditional annuity) still taxed at heir rate.
3. **Validate:** baseline parity, from-IRA gross-up, `giConversionTax` display
   attribution, golden masters, AND against a real carrier illustration (also
   resolves F8). Add SS-bearing + pension-bearing + legacy-mode GI clients to the
   recompute suite so these paths are permanently guarded (the gap that hid them:
   GI fixtures had $0 SS and Phase 2 never covered the GI conversion/income tax path).

## Standing suite (`npm run test:audit`) — what it covers + GAPS
Under `lib/calculations/__tests__/audit/`:
- `factory.ts` — `makeClient()` (cents) + `dispatch()` (routes to the right engine
  exactly like the projections route; NOTE: `fia` + all growth products → growth
  engine, not standard `runSimulation`).
- `assertions.ts` — Reporter + invariants (conservation, netWorth=parts, tax
  composition, non-negative, **finite**, full-conversion drain, partial cap, BOY
  continuity, trad tie-out, symmetry).
- Phases: `invariants` (Phase1), `recompute` (Phase2, independent bracket walk w/
  inflation + SS torpedo — **standard/growth only, NOT GI conversion**), `edge-matrix`
  (RMD ages, 59.5, IRMAA cliffs/lookback, surrender, GI phases), `stress-sweep`
  (1440 combos), `golden-masters` (growth+GI dispatch), `correctness-extra`
  (deduction/SS-COLA/IRMAA), `correctness-credits` (tax credits + gross-up),
  `aum-theory`/`aum-combined`, `growth-theory` (compound growth/monotonicity/
  convert-low-save-high), `penalty-free-cap`, `widow-theory`, `gi-mechanics`
  (payout factor exact; flags F8), `optimizer-fill` (F6 guard, EXPECT_FIXED=true),
  `no-hardcoded-rates` (F1/F9 guard, scans components+lib/chat), `reconcile-table`
  (documents pre-F2 drift).
- `realdata-sweep` (separate, needs `.env.local`): 566 real clients × invariants —
  conservation/finiteness only, NOT correctness recompute.
**KEY LESSON / blind spot:** invariants + my-recompute prove internal consistency
and my-impl-vs-engine, NOT correctness vs real-world spec. Bugs survive when the
engine is self-consistent but wrong, or when a path isn't fed realistic inputs
(GI + SS/pension/legacy = exactly that). The way bugs got found: build realistic,
varied "report-card" test clients and hand/independently check their numbers.

## How to keep hunting (the method that worked)
Make realistic advisor-shaped clients (vary product, filing, state, SS, pension,
AUM, widow, legacy mode, ages straddling 59.5/73/75), run `dispatch()`, print a
report card (final balances, lifetime wealth, conv tax, RMD tax, IRMAA tiers,
legacy), then: (a) sanity-check magnitudes, (b) independently recompute tax
(bracket walk + SS torpedo + inflation), (c) reconcile the headline across engine/
table/PDF formulas (see generate-pdf/route.ts ~790-845 for the canonical headline
formulas). The standard + growth engines look solid; AUM is covered; **GI is where
remaining risk is.**

## Constraints / project facts (from CLAUDE.md + memory)
- `main` = production, Vercel auto-deploys; test on app.retirementexpert.ai. Don't
  push customer-facing comments/replies without approval. Run `tsc` before commit
  (Next build type-checks scripts/ too). Engine in CENTS everywhere.
- Engine output changes ⇒ bump `PRODUCT_CONFIG_VERSION` in
  `app/api/clients/[id]/projections/route.ts` (currently 69) so cached projections
  recompute. Display-only fixes don't need it.
- Heir rate: ALWAYS read `client.heir_tax_rate` (fallback heir_bracket, else 40),
  never hardcode 0.40. Guard: `no-hardcoded-rates.test.ts`. Dead components
  (gi-summary-breakdown-table, summary-comparison-table, results-summary,
  multi-strategy-results) still hardcode it but are unmounted (allow-listed).
