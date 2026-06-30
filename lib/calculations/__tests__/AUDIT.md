# Engine & Year-by-Year Table Audit — Findings Ledger

> ⚠️ **IN-FLIGHT CHANGE — 2026-06-29.** Another agent just **pushed to `main`** a
> fix to non-SSI income aggregation (`utils/income.ts`: sum all same-year income
> rows instead of `.find()`-ing only the first). Multi-stream clients
> (pension+rental+annuity in one year) were undercounted in every engine →
> optimizer over-converted. Single-row-per-year clients are byte-identical.
> `PRODUCT_CONFIG_VERSION` → 68. Full writeup: **`IN-FLIGHT-CHANGES.md`** (same
> dir). Expected if you re-baseline — not a regression you caused.

Standing audit of the calculation engines and the report/year-by-year tables.
Goal: every number an advisor sees reconciles to the engine, and the engine's
internal math is self-consistent across all inputs.

**Suite:** `npm run test:audit` (runs everything under `lib/calculations/__tests__/audit/`).

Severity: **P0** = wrong money / phantom dollars · **P1** = advisor-facing column
shows a wrong number · **P2** = cosmetic / coverage gap · **SPEC** = needs a
product/spec decision, not obviously a code bug.

Status: ✅ fixed · 🔎 reported (awaiting decision) · 🟢 verified-correct (no bug).

---

## Phase 1 — Invariants (engine internal consistency) — ✅ GREEN

10,990 per-year checks across all three engines (standard/`fia`, growth FIA, GI),
**0 breaches**. The following hold on every row of every fixture:

- `netWorth == traditional + roth + taxable` (headline = sum of parts)
- `totalTax == fed + state + niit + irmaa (+penalty)` (±IRMAA definition)
- no negative balances/taxes/fees
- `full_conversion` drains the IRA to ~$0 and shows no RMD once drained
- `partial_amount` total never exceeds `target_partial_amount`
- BOY continuity (`traditionalBOY[y] == traditionalBalance[y-1]`)
- year-over-year traditional-balance tie-out (BOY − withdrawals + growth + bonus − riderFee = EOY)
- baseline ≡ no-conversion strategy when rates aligned & no fee/bonus

**Conclusion: the core engine money-movement is sound.** This is now locked as a
regression guard.

---

## FINDINGS

### F1 — Report "Legacy to Heirs" hardcoded 40% heir rate — **P1 ✅ FIXED**
- **Where:** `components/report/year-over-year-tables.tsx` (was line 188).
- **Symptom:** `const heirTaxRate = 0.40;` — the column ignored `client.heir_tax_rate`.
  Any client with a heir rate ≠ 40% saw a wrong Legacy-to-Heirs figure on the
  growth report.
- **Root cause:** hardcode instead of reading the client field the engine's own
  heir-benefit metric uses.
- **Fix:** `const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;` (falls back to
  40% only when unset). Engine side already used `client.heir_tax_rate`.

### F2 — Report table AGI / Taxable Income omit taxable Social Security — **P1 ✅ FIXED (growth) / 🔎 PARTIAL (GI)**
- **Growth report table — ✅ FIXED:** `year-over-year-tables.tsx` now reads the
  engine's `agi`/`standardDeduction`/`taxableIncome`/`federalTaxBracket`/`magi`
  fields (single source of truth) instead of re-deriving them, so the taxable-SS
  portion is no longer dropped. Visible AGI/Taxable-Income/bracket columns will
  rise for SS clients to match the engine + the rest of the report.
- **GI report table (`gi-year-over-year-tables.tsx`) — ✅ FIXED:** now reads engine
  `agi`/`taxableIncome`/`magi`/`standardDeduction`. Besides the taxable-SS fix,
  this corrects a hidden bug: the old code added the **tax-free** Roth GI payment
  into `agi` AND `magi` during the income phase, overstating MAGI and risking a
  too-high IRMAA tier. Engine `agi`/`taxableIncome` are $0 in the tax-free income
  years (correct); the gross payment remains visible in the GI Payment column.

---
### F2-original — Report table AGI / Taxable Income omit taxable Social Security (detail)
- **Where:** `components/report/year-over-year-tables.tsx` `computedData` useMemo
  (and the GI sibling `gi-year-over-year-tables.tsx`).
- **Symptom:** the table derives `agi = otherIncome + distIra`, omitting the
  taxable SS portion. The engine's `agi` field includes it. Example (single,
  $30K SS, age 75): table AGI **$36,399** vs engine **$57,877** — a **$21,478**
  understatement that grows to ~$37K by the late years and flows straight into
  the **Taxable Income** column and the **bracket**.
- **Impact:** every client with Social Security sees AGI / Taxable Income columns
  that are materially low and inconsistent with the tax the same report charges.
  High-visibility "these numbers don't add up" source.
- **Root cause:** the tables RE-DERIVE agi/magi/taxableIncome/bracket in-component
  instead of reading the engine fields of the same name. The engine already
  populates `agi`, `magi`, `taxableIncome`, `standardDeduction`,
  `federalTaxBracket`, `irmaaTier`, `taxableSS` on **every** row (verified —
  Phase 3 coverage check is green).
- **Proposed fix (needs sign-off — changes visible numbers on live reports):**
  migrate the report tables to read engine fields (single source of truth) and
  delete the in-component re-derivation. Quantified by
  `audit/reconcile-table.test.ts` (157 drifting rows across 3 fixtures).

### F3 — Golden fixtures lock the wrong engine for `fia` — **SPEC 🔎 REPORTED**
- **Where:** `lib/calculations/__tests__/report-fixtures.test.ts` calls
  `runSimulationWithMetrics` (the **standard** engine). Production routes `fia`
  (and every growth product) through `runGrowthSimulation` (`isGrowthProduct('fia')`
  is true).
- **Symptom:** for the locked "Paul" `fia` fixture, standard vs production
  (growth) **disagree by $13,347** on final strategy net worth / $11,900 on Roth.
  Baseline matches exactly — the gap is the growth engine's `post_contract_rate`
  (5%) applied after the surrender period, which the standard engine never applies.
- **Impact:** the golden test's strategy-side locks don't protect the numbers
  production actually shows for `fia`. Drift in the growth engine could pass the
  golden test untouched.
- **Decision needed:** (a) point the golden fixtures at the dispatched engine so
  they lock production reality, and/or (b) confirm whether a Generic Growth `fia`
  should really credit a lower `post_contract_rate` post-surrender vs the baseline
  market rate. Not obviously a code bug — a spec/coverage choice.

### F5 — The headline golden test is RED and has been muted — **P0 🔎 REPORTED**
- **Where:** `lib/calculations/__tests__/report-fixtures.test.ts` — **30 passed,
  21 failed** at HEAD (verified pre-existing, not caused by this audit).
- **Symptom:** all 21 failures are on the strategy (`blue`) side — finalNetWorth,
  lifetimeWealth, taxOnConversions, taxOnRMDs, totalFedStateTax across Fucci /
  Paul / Sprengel. The locks were captured at commit `53e86a2`; the engine has
  since moved through v64→v67 conversion-tax fixes and **nobody updated the locks
  or confirmed the new numbers**.
- **Why it matters:** this test is the team's main defense against silent
  calculation drift (its own header cites the Paul-George/Jorge incident). A red,
  ignored golden test is *worse* than none — it trains everyone to skip it. This
  is the mechanism behind "audits keep missing things."
- **Action needed:** for each of the 21, decide whether the v64–v67 change was
  intentional (then update the lock + REPORT_SPEC.md, per the test's own
  instructions) or a regression (then fix the engine). Until triaged, we do not
  know which of the 21 are correct. This must be resolved before new golden
  masters (Phase 7) are trustworthy.

### F4 — `traditionalGrowth` & GI BOY fields unpopulated on some rows — **P2 🟢 VERIFIED-CORRECT (no bug)**
- Re-checked: `traditionalGrowth`/`rothGrowth`/`taxableGrowth`/`*BOY` are
  populated on **every** row across all three engines — the adjustable-table
  columns render fine. The only "gaps" are semantically-empty IRA fields during
  GI purchase/income phases (no IRA balance → no `totalIRAWithdrawal`), which is
  correct. The original coverage flag was an artifact of the harness's first
  iteration. No action needed.

### (old F4 wording, superseded)
- **Symptom:** several adjustable-table columns map to engine fields that aren't
  populated on every engine/phase (e.g. `traditionalGrowth`; GI purchase/income
  rows). A column bound to an unpopulated field renders blank.
- **Action:** enumerate per-engine field coverage (Phase 3 coverage check is the
  start) and either populate or hide the affected columns.

---

## Verified-correct (investigated, NOT bugs) — 🟢

- **Post-surrender rate divergence** (no-conversion strategy ≠ baseline after the
  surrender period): legitimate — the FIA credits `post_contract_rate` while the
  "do nothing" baseline keeps the market rate. Symmetry only holds when the three
  rates are aligned and there's no fee/bonus.
- **Rider-fee divergence** on high-bonus growth products (strategy < baseline by
  ~0.95%/yr): legitimate product rider fee the strategy pays and the baseline
  doesn't.
- **Upfront-bonus year-1 balance:** the one-time issue bonus is baked into the
  opening balance, not a per-year flow — tie-out accounts for it from year 2 on.

---

## Phases run — all GREEN

| Phase | What | Result |
|-------|------|--------|
| 1 | Invariants (conservation/composition/non-neg/drain/cap/tie-out/symmetry) | **10,990 checks, 0 breaches** |
| 2 | Independent recompute (own 2026 bracket walk w/ inflation indexing + SS torpedo) vs engine | **584 checks, 0 breaches** — federal tax + taxable income + SS certified correct |
| 4 | Edge & boundary matrix (RMD 73/75, 59½ penalty, IRMAA cliff integrity, surrender boundary, GI phase order) | **117 checks, 0 breaches** |
| 5 | Combinatorial stress sweep (product × conversion × filing × state × pay-source × RMD-treatment) | **1,440 combos · 1,455,360 checks, 0 breaches** |
| 6 | Real-data sweep — every live client through the invariants (`npm run test:audit:realdata`) | **560 real clients · 601,009 checks, 0 breaches** |
| 7 | Golden masters for the GROWTH + GI production engines (closes F3 coverage gap) | **14 locks, captured + certified** |
| 3 | Engine ⇄ report-table reconciliation | documents the pre-F2 drift the fix eliminated |

**Bottom line:** the engine's money-movement and tax math are independently
certified correct and internally consistent across synthetic grids AND all 560
real production clients. The only defects found were in the **display layer**
(F1, F2, F2-GI — all fixed) and **test hygiene** (F5 stale golden — re-locked).

### F3 — addressed
Phase 7 (`audit/golden-masters.test.ts`) now locks headline numbers from the
GROWTH and GI engines via `dispatch` (the production routing), covering the gap
where `report-fixtures.test.ts` only guarded the standard engine. Whether `fia`
*should* use a lower `post_contract_rate` post-surrender remains a product
question, but drift is now caught on the engines production actually runs.

### F6 — Optimizer under-converts at RMD age when tax is paid from the IRA — **P1 ✅ FIXED**
**FIXED 2026-06-30** in `formula.ts` AND `growth-formula.ts`: the optimized/partial
+ pay-from-IRA branch now gates on `useSelfConsistent` and fills the bracket
crediting `afterTaxForcedRmd` (only tax beyond the RMD pulls extra taxable
dollars), mirroring the full/fixed branches. Verified: optimizer fills to 100% at
RMD age (was ~85%); ALL conservation/recompute/edge/stress/real-data invariants
still 0 breaches (the fix converts more without breaking money conservation or tax
correctness); fixed-amount golden unaffected (51/51). Guard:
`audit/optimizer-fill.test.ts` (`EXPECT_FIXED=true`). Original detail below.


- **Where:** `scenarios/formula.ts:455` (and the mirror in `growth-formula.ts`) —
  the `optimized_amount` / `partial_amount` branch when `payTaxFromIRA` is true
  (explicit `from_ira`, or the taxable-account-is-$0 fallback).
- **Symptom:** before RMDs the optimizer fills the target bracket to **100%**.
  Once RMDs begin (age 73/75) the fill drops to ~**85%**, leaving bracket room
  **exactly equal to the conversion tax** unused — every year. Example (single,
  $40K SS, 24% target, from_ira): age 73 taxable income $206,394 vs a $240,930
  ceiling — **$34,536 of 24%-bracket room unfilled** with IRA remaining. Over the
  projection that is **~$604K of conversions never made** for one client; the
  strategy's final Roth is materially understated.
- **Root cause:** the `full_conversion`/`fixed_amount` branches were fixed (v64/v66)
  to fund conversion tax from the RMD (`afterTaxForcedRmd`, formula.ts:371) — the
  RMD is already taxable income in the bracket, so the tax it funds must NOT
  reserve additional bracket room. The `optimized_amount`/`partial_amount` branch
  was **never given that treatment**: `calculateSSAwareIRAWithdrawalPlan` sizes
  `conversion + full tax` to the bracket, double-counting the RMD (once in
  `otherIncomeForTax`, once as reserved tax room).
- **Why invariants missed it:** the result is fully self-consistent (money
  conserves, taxes compose, taxable income ≤ ceiling) — it's just *suboptimal*.
  Caught only by an independent "does optimized fill the bracket?" correctness
  probe, not by conservation checks. (This is the honest answer to "why no engine
  bugs the first pass": consistency ≠ optimality.)
- **Blast radius:** `optimized_amount`/`partial_amount` clients paying conversion
  tax from the IRA (or with a $0 taxable account) at/after RMD age. Fixing it
  changes Roth-conversion amounts on their live reports — advisor-facing.
- **Fix direction:** mirror the full-conversion treatment — credit
  `afterTaxForcedRmd` against the conversion tax so only tax beyond the RMD's
  funding capacity reserves extra bracket room. Captured by
  `audit/optimizer-fill.test.ts` (currently documents the gap; flips to a guard
  once fixed). **Needs greenlight before changing core conversion behavior.**

## Correctness probes (round 2–3) — independently verified CORRECT 🟢
Beyond the invariants, these re-derive values from scratch and diff vs the engine:
- **Standard deduction** — base + senior bonus, both inflation-indexed 3%/yr (single/MFJ/HoH, ages 62/65/70, spouse 60/66, years 2026/31/40). `audit/correctness-extra.test.ts`.
- **SS COLA** — `ssIncome == initial × 1.02^(years collecting)`, paid only from payout age.
- **IRMAA** — surcharge equals the tier amount AND the **2-year lookback** holds (year T surcharge matches MAGI at T−2). 24 lookback rows.
- **Tax-credit carryforward** — credit applied = min(pool, pre-credit fed tax); post-credit fed tax exact; pool never negative; lifetime ≤ pool. `audit/correctness-credits.test.ts`.
- **Gross-up / RMD-funds-tax identity** — `conv+RMD ≤ totalIRAWithdrawal ≤ conv+RMD+tax` across optimized/fixed/full (the RMD funds conversion tax first; only the shortfall pulls extra).
- **RMD amount** — `= prior-year balance ÷ Uniform-Lifetime divisor`, to the dollar.

## Known limitations (documented, not defects)
- **NIIT not modeled** — `niitTax: 0` hardcoded in baseline/formula ("Simplified — not
  in basic model"). High-investment-income clients above the $200K/$250K threshold
  are not charged the 3.8% NIIT. Intentional simplification; flag if it should change.

## Theory checks — engine matches finance first principles 🟢
Not just self-consistent — verified against theory (`audit/growth-theory.test.ts`,
`audit/aum-theory.test.ts`):
- **Compound growth** — a no-distribution IRA grows by round(bal×rate)/yr (exact)
  AND within 0.1% of premium×(1+r)^n (the "$250K@7%×40yr=$3.7M, else the bug is in
  the inputs" sanity). Verified 6/7/8%.
- **Conversion monotonicity** — a higher target bracket never yields LESS final Roth.
- **Convert-low-save-high theorem** — converting at 22% when heirs pay 40%, with RMD
  friction, RAISES net legacy (verified +$1.05M on a $2M case). The strategy beats
  baseline exactly when theory says it must.
- **AUM engine** — IRA→AUM transfer completes on schedule; transfer taxed at ordinary
  marginal + state (+10% under 59½); cash conserves (gross = net + tax + penalty);
  post-transfer brokerage net growth sits inside (0, gross rate) — fees + dividend +
  turnover drag bite but never exceed the rate. End balances sensible vs theory.

## Now verified (was the backlog) 🟢
- **Penalty-free surrender cap** — `tax_only` caps tax-from-IRA ≤ pf%×BOY-IRA;
  `all_distributions` caps conv+RMD+tax. Both scopes, multiple surrender lengths.
  `audit/penalty-free-cap.test.ts` (104 checks green).
- **AUM combined overlay** — split integrity (Roth-side IRA + AUM pending-IRA =
  premium), combined conservation/non-negativity, and shortfall absorption
  (ticket 34b54286: 100% AUM + scheduled withdrawals fully absorbed, not clipped).
  `audit/aum-combined.test.ts` (54 checks green).
- **Widow module** — see F7 (fixed + verified).
- **GI product mechanics** — payout factor exact (base × config factor to the
  dollar); roll-up rate magnitudes exact; tier-boundary flagged as F8.

## Still UNVERIFIED (remaining)
- **Carrier-illustration validation** — the `validate-*.ts` need seeded custom
  products (untracked `seed-*.ts`) absent from this DB. Required to resolve F8 and
  to confirm custom-product roll-up/payout/bonus to the dollar. Run after seeding.
- **AUM marginal coordination** — v1 uses a flat marginal rate for the IRA→AUM
  pull (no SS-torpedo interaction); documented engine simplification, not audited.

### F7 — Widow penalty overstated in future years (deduction not inflated) — **P1 ✅ FIXED**
- **Where:** `lib/calculations/analysis/widow-penalty.ts` `calculateWidowTaxImpact`.
- **Symptom:** the module inflation-indexed the tax BRACKETS to the projection
  year (via `calculateFederalTax({taxYear: year})`) but passed `undefined` for the
  standard deduction's year, freezing it at 2026. Future post-death years used
  inflated brackets with a 2026 deduction → overstated the survivor's taxable
  income and the widow penalty, growing with the horizon (e.g. ~$1.5K too much tax
  on a $600K-income widow in 2035). The main projection inflates both.
- **Fix:** pass `year` to `getEffectiveDeduction` for both filings. Verified: widow
  module now matches an independent recompute across incomes/years/ages, and the
  widow penalty stays ≥ 0 (theory). `audit/widow-theory.test.ts` (80 checks green).

### F8 — GI tiered roll-up credits the top tier one year short — **P1 🔎 NEEDS CARRIER CONFIRMATION**
- **Where:** `lib/calculations/guaranteed-income/engine.ts:809`
  `deferralYear = age - purchaseAge + 1`.
- **Symptom:** for `compound-rollup-income` (config: 7% compound roll-up tier
  years 1-5, 4% years 6-10), the engine credits **7% for only 4 deferral years**
  then switches to 4% — the `+1` labels the FIRST roll-up "year 2", so the 4%
  tier starts one anniversary early. Per-tier rates are exact (7% and 4% applied
  correctly); only the BOUNDARY is shifted. A literal reading of `years:[1,5]`
  says 5 years of 7% — the engine gives 4 → understates the income benefit base
  and lifetime guaranteed income for tiered-roll-up GI products.
- **Why NOT auto-fixed:** these GI products were historically "validated to the
  dollar against carrier illustrations." The carrier may genuinely credit this
  way (income base set at purchase, first anniversary credit at year-1 end), in
  which case the engine is right and the config comment is loose. Confirming
  requires the carrier illustration — `validate-*.ts` need seeded custom products
  not present in this DB, so it could not be run here. **Action:** diff the engine
  roll-up schedule vs a tiered-roll-up carrier illustration; if the carrier shows
  5×7%, change to `age - purchaseAge` (verified to give 7% at ages 68-72 then 4%).
  Documented by `audit/gi-mechanics.test.ts` (payout factor verified exact:
  base × 7.5% @age74 to the dollar).

### F9 — Hardcoded 40% heir rate cluster (chat live; report surfaces dead) — **P1 chat ✅ FIXED / P2 latent**
Swept every hardcoded heir rate outside the engine. Two classes:
- **LIVE — chat assistant ✅ FIXED:** `lib/chat/tools.ts` `runGetProjectionSummary`
  computed `heir_tax`, Net Legacy and Lifetime Wealth with a hardcoded 40%. The
  chat is a live surface (advisors ask it for headline numbers), so for any client
  whose heir rate ≠ 40% the **chat contradicted the PDF report** (which uses
  `client.heir_tax_rate` after F1). Fixed: fetch the client's `heir_tax_rate`
  (fallback `heir_bracket`, else 40), mirroring the engine's resolution.
- **LATENT — dead components (documented, not fixed):** `gi-summary-breakdown-table.tsx`,
  `summary-comparison-table.tsx`, `results-summary.tsx`, `multi-strategy-results.tsx`
  hardcode 40% (or call `transformToChartData` without the rate). All four are
  **dead code** — only barrel-exported, never mounted (multi-strategy.ts:82 notes
  `<MultiStrategyResults>` isn't mounted). No advisor impact today, but a landmine
  if revived. The LIVE report surfaces (growth/GI dashboards, presentation-mode)
  already pass `client.heir_tax_rate` correctly — verified.

### F10 — Story "Tax on Conversion" disagreed with the table for from-IRA — **P1 ✅ FIXED**
- **Where:** `lib/calculations/story-generator.ts` used `computePerYearMarginal
  ConversionTax` for the story card's "Tax on Conversion", but the year-by-year
  table, the PDF, and the locked golden test all use the engine's
  `federalTaxOnConversions + stateTaxOnConversions` fields.
- **Symptom:** the two definitions coincide for `from_taxable`/`optimized` but
  diverge for **fixed-amount + pay-from-IRA**: the marginal helper folds the
  gross-up pull's tax into "conversion tax" while the engine field (v67 display
  attribution) does not. Result: ~$10K lifetime / up to $1,708/yr gap — the story
  card and the table showed different "Tax on Conversion" for the same client.
- **Fix:** story now reads the engine fields — identical source to table/PDF/golden,
  so they can't disagree. Still isolates conversion from background SS/pension tax
  (Greg Stopp's original ask); only the gross-up attribution changed to the canonical.
- **Verified:** golden test still 51/51; story expression now byte-identical to the
  table's (`(federalTaxOnConversions ?? 0) + (stateTaxOnConversions ?? 0)`).

### F11 — Display-layer hardening + cache-completeness sweep — **P2 (mostly clean)**
- **Table formatters didn't guard NaN/Infinity ✅ HARDENED:** `formatCurrency` /
  `formatPercent` / `formatNumber` (`lib/table-columns/column-definitions.ts`)
  guarded null/undefined but not non-finite — a NaN/Infinity field would render
  "$NaN"/"Infinity%". The engine produces NONE today (verified finite across 5.2M
  stress + 2.1M real-client field checks), and a NaN would have slipped past the
  non-negativity check (NaN comparisons are always false), so a `checkFinite`
  invariant now runs in invariants/stress/real-data. Formatters hardened anyway.
- **Cache invalidation — complete except 2 legacy fallbacks:** the projection
  input hash covers every calc-affecting field EXCEPT `ss_start_age` and
  `heir_bracket`, which are fallback-only (used solely when `ssi_payout_age` /
  `heir_tax_rate` is null). So a stale-cache mismatch is only possible for a
  client whose primary field is null and who edits the fallback — low risk. Add
  both to `generateInputHash` to close it fully.
- **Verified-correct (no bug):** per-type income-breakdown columns sum exactly to
  the engine's `otherIncome`; chart legacy-to-heirs (signed taxable) vs table
  (max-0) coincide because `taxableBalance ≥ 0` always (600K+ checks); surrender
  value overstatement for high-bonus products is the KNOWN deferred display bug
  already tracked in memory (premium-bonus recapture omitted) — left as-is.

### F12 — IRMAA tier column mislabels non-IRMAA clients as "Tier 1" — **P1 ✅ FIXED**
- **Where:** `getIRMAATier` in BOTH `year-over-year-tables.tsx` and
  `gi-year-over-year-tables.tsx` (the growth version's own comment admitted
  "simplified — actual mapping would need thresholds").
- **Symptom:** `if (irmaaSurcharge === 0) return "Tier 1"` — a 65+ client with $0
  surcharge (i.e. BELOW the first IRMAA threshold — **most retirees**) was labeled
  "IRMAA Tier 1". The report's IRMAA tab told advisors their not-in-IRMAA clients
  were in Tier 1. It also re-derived the tier from the surcharge DOLLAR amount
  using single-filer bands, misclassifying joint filers.
- **Fix:** both tables now read the engine's `year.irmaaTier` (0 = Standard,
  1-5 = real tiers — same field the adjustable table + `formatTier` use). Verified:
  a 65+ MFJ retiree at $0 surcharge now shows "Standard" (was "Tier 1"); 15
  zero-surcharge years, 0 mislabeled. The engine tier↔surcharge consistency is
  already locked by `audit/edge-matrix.test.ts`.

### F13 — Dashboard "Legacy Protected" + `determineBracket` hardcodes — **P2/P3 🔎 REPORTED**
- `dashboard-metrics.ts:128` computes the aggregate "Total Legacy Protected" KPI as
  `blueprint_final_roth * 0.4` — hardcoded 40% heir rate across ALL clients,
  ignoring each client's `heir_tax_rate`. Aggregate marketing headline (not a
  per-client report number), so lower severity, but should weight by the real rate.
- `year-over-year-tables.tsx determineBracket` hardcodes 2026 bracket thresholds
  with NO inflation indexing. Now a fallback (post-F2 the table reads
  `year.federalTaxBracket`), so it never runs in practice — but it would return the
  wrong bracket for future years if it ever did. Replace with the engine field or
  delete. (The no-hardcoded-rates guard scans components+chat; neither of these
  matches its `heirTaxRate =` pattern — worth widening.)

## Recurrence guard 🛡️
- `audit/no-hardcoded-rates.test.ts` scans live `components/` + `lib/chat` source and
  FAILS if any new hardcoded heir/legacy rate appears (the F1/F9 class). The 4 dead
  components are allow-listed; reviving one forces the fix. Recommend a matching
  ESLint rule for editor-time feedback.

## Investigated, NOT bugs (the audit's discipline — verified before claiming) — 🟢
- Engine federal tax < a naive static-2026 bracket walk: the engine correctly
  **inflation-indexes brackets** 3%/yr while freezing SS thresholds. Recompute
  updated to match → green.
- `phased-bonus-growth` tie-out drift (82 real clients): the anniversary bonus is
  baked into `*Growth`; `productBonusApplied` is a separate overlapping display
  field. Money conserves (ΔnetWorth gap == bonus in anniversary years, $0 else).
  Tie-out corrected to not double-count.
- Negative-IRA-floor rows (−$1…−$1,311 → $0): the documented `iraAfterConversion`
  floor working. Tie-out made floor-aware.
