# Held-back Traditional IRA feature + session work log

_Built over the session ending 2026-07-07. All on `main`, deployed, unless noted._

---

## 1. What the held-back IRA feature is

Models a **partial Roth conversion**: the client converts part of their IRA into the
annuity and leaves the rest as a **plain Traditional IRA elsewhere** (e.g. Fidelity).
Origin: Greg Stopp / "Bill Schlip (Greg copy)" cases — $3M IRA, convert $1.5M, keep $1.5M
traditional. Neither the growth engine's default (whole IRA into the annuity, bonus on
everything) nor the AUM split (liquidates the rest into a taxable brokerage) modeled that
correctly.

### How an advisor uses it
1. **Qualified Account Value** = the amount going **into the annuity** (the converting
   slice), NOT the full IRA. (This keeps the premium bonus sized to the slice.)
2. Tax Data → check **"RMDs Handled Externally"** → reveals the held-back fields.
3. Enter **Held-back Traditional IRA** balance (the portion staying traditional) + optional
   growth rate (defaults to `rate_of_return`).

### What the engine does
- Computes the held-back IRA's RMDs each year (grows + **depletes** the balance so each
  year's RMD is right) via `computeHeldBackRmdSchedule`.
- Folds those RMDs into **ordinary income on BOTH baseline and strategy** (through the
  non-SSI income channel) so the conversion is taxed in the **correct brackets**
  (SS-torpedo / IRMAA aware). This is the "income-only overlay."
- **Overrides `rmds_handled_externally` back to false internally** when a held-back balance
  is present, so the converting slice keeps modeling **its own** RMDs. Net result:
  - Do-nothing → RMDs on the **full** balance
  - Strategy → RMDs on just the **held-back** portion (converted money is Roth, no RMDs)

### What shows in the report
- **RMD** column → the converting slice's RMDs
- **RMD (External)** column (toggle via "Adjust Columns") → the held-back IRA's RMDs
- **Other Income** → excludes RMDs entirely (internal *and* external), via a per-column
  `accessor` that subtracts `externalRmd` — consistent with how internal RMDs behave.
- **Lifetime Wealth tooltip** → RMD narrative includes held-back RMDs; a note explains the
  balances shown are for the converted portion and the held-back IRA nets out of the delta.

---

## 2. Key files

| File | What |
|---|---|
| `lib/calculations/utils/held-back-ira.ts` | `applyHeldBackIraRmd(client)` (income injection + override of `rmds_handled_externally`) and `computeHeldBackRmdSchedule(client)` (per-year RMD map). No-op when no balance. |
| `lib/types/client.ts` | fields `held_back_ira_balance`, `held_back_ira_growth_rate` |
| `lib/validations/client.ts` | validation (both base + legacy schemas) |
| `lib/calculations/types.ts` | `YearlyResult.externalRmd` (display-only field) |
| `app/api/clients/[id]/projections/route.ts` | wires `applyHeldBackIraRmd` into all 3 dispatch branches (GI/growth/standard) via `clientForSim`; annotates `externalRmd` on baseline+blueprint rows in `simulationToProjection`; `held_back_*` in the cache hash; **cache version v72**. |
| `lib/table-columns/column-definitions.ts` | "RMD (External)" column; per-column `accessor` support; Other Income accessor subtracting `externalRmd` |
| `components/results/deep-dive/resizable-table.tsx` + `resizable-comparison-table.tsx` | use `col.accessor` when present |
| `components/clients/sections/tax-data.tsx` | held-back fields revealed under the checkbox; RMD Treatment field now shows when held-back balance > 0 |
| `components/clients/client-form.tsx`, `components/report/input-drawer.tsx`, `input-sidebar.tsx` | form defaults |
| `components/report/growth-report-dashboard.tsx` | `baseRMDs` folds in `externalRmd`; held-back note in the lifetime-wealth tooltip |
| `supabase/migrations/20260628120000_clients_held_back_ira.sql` | DB columns (applied to prod) |

---

## 3. Design decisions (and the flip-flops that were resolved)

1. **Slice-only, not AUM split.** For a partial conversion, model only the converting
   amount as Qualified Account Value; the untouched IRA is a **wash** on the delta. The AUM
   split was wrong here (it liquidates the rest into a taxable brokerage).
2. **Income-only overlay, not a separate sim.** The held-back RMD is injected as income so
   the conversion is taxed with it stacked underneath (the bracket interaction). A separate
   sim would tax it in its own brackets and lose that interaction.
3. **Decouple → re-couple with override.** First shipped gated behind the checkbox (which
   zeroed the slice's RMDs → **Bill Schlip showed $0 RMDs**). Fix: keep the UI coupling
   (held-back under the checkbox — matches the advisor's mental model that RMDs come "from"
   that IRA), but when a held-back balance is set, **override the zeroing** so the slice
   keeps its RMDs.
4. **"RMD (External)" column, not merging into `rmdAmount`.** `rmdAmount` is load-bearing
   (~15 consumers: cash flow, distribution totals, PDF, summary metrics). A separate
   display field avoids corrupting them.
5. **Other Income accessor.** The injected held-back RMD lands in `otherIncome`; the column
   accessor subtracts it so RMDs never appear in Other Income (internal RMDs never did).

---

## 4. Verification (Bill Schlip = "Bill Schlip (Greg copy)")

Config: qual(slice) $1.5M, held-back $1.5M, age 62, Athene Performance Elite 10 Plus,
from_ira, conversion optimized_amount, maxTax 32%.

- **Additional Lifetime Wealth: $1,880,293 (+15.9%)** — accurate (held-back cancels in the
  delta; balance excluded both sides, heir tax cancels, RMD-tax bracket interaction captured).
- RMD column (slice): ~$6.5M lifetime. RMD (External): ~$5.7M lifetime. Tooltip narrative
  now shows the full **$12,222,949**.
- Feature is a **no-op** when no held-back balance → existing clients byte-identical.
- Full audit suite: **0 breaches / 5.2M invariant checks, 14/14 golden masters**; reconcile
  at the pre-existing 157 (F2 drift, unchanged).
- Verification approach: ad-hoc `scripts/_tmp-*.ts` harnesses (deleted after use) that run
  `runGrowthSimulation(createSimulationInput(applyHeldBackIraRmd(client), product))`;
  `npm run test:audit`; compare with/without held-back for the delta.

---

## 5. Tiers of accuracy — what's built

There are three components to the held-back IRA. Two cancel EXACTLY in the strategy-vs-
baseline delta for every client; only one does not.

| Component | Same on both sides? | Handled by |
|---|---|---|
| Starting balance, growth, RMD schedule | Yes (depends only on balance/age) | cancels — nothing to do |
| Terminal balance + heir tax on it | Yes (same balance × same rate) | cancels — nothing to do |
| **After-tax RMD proceeds** (RMDs taxed at each side's own marginal rate) | **No** | **`applyHeldBackResidualToStrategy` (v74) — BUILT** |

### Tier 1 (v72) — income-only overlay
`applyHeldBackIraRmd`: injects the held-back RMDs into both sides' ordinary income so the
conversion is taxed in the correct brackets. Makes the tax right; banks no proceeds.

### Tier 2 (v74) — the residual — BUILT 2026-07-08
`applyHeldBackResidualToStrategy`: the held-back RMDs are taxed at a **different marginal
rate on each side** (do-nothing sits high from its own slice RMDs; the strategy sits lower
once the slice is Roth), so the strategy keeps more of each RMD after tax. That difference —
reinvested and grown — is the ONE piece that does **not** cancel, and it's now folded into
the strategy's `netWorth`/`taxableBalance` (so the Additional Lifetime Wealth headline
reflects it). **Income-sensitive:** ~10% of the delta for a high-outside-income client (the
origin case: Bill's headline $1.88M → $2.38M), rising to 25–100%+ for low-income clients
(verified sweep — the two brackets diverge more the lower the outside income).
- **Marginal tax method:** `calculateConversionFederalTax` stacking the RMD at its **floor
  position** (base = `taxableIncome − conversionAmount − rmd`), so the discretionary
  conversion correctly sits ABOVE the mandatory RMD. Verified per-year against the engine's
  own with/without marginal: **exact on the baseline**; on the strategy the with/without
  shows $0 in conversion-overlap years because the RMD *displaces* conversion room — but that
  benefit is already in `netWorth` (smaller conversion → less Roth), so the with/without
  DOUBLE-COUNTS there and the floor-position calc is the correct, non-double-counting choice.
- **No-op** when there's no held-back balance or `rmd_treatment='spent'` (spent proceeds
  aren't legacy). Baseline byte-identical; strategy-side only. Audit: 0 breaches / 14-14
  golden masters (no fixture uses held-back).
- **Deliberately conservative:** the floor-position calc omits SS-torpedo/IRMAA *marginal*
  effects on the held-back RMD, which would only make the residual larger for low-income
  clients — so it under-states rather than over-sells.
- **Consistency audit (2026-07-08):** the residual is baked into `blueprint_final_net_worth`
  AND `blueprint_final_taxable` + each strategy `blueprint_years` row's `netWorth`/
  `taxableBalance`/`heldBackResidual`. Every headline surface (dashboard hero, Lifetime
  Wealth + Legacy cards, presentation mode, growth Story Mode "Extra Wealth Created", growth
  PDF) reads `blueprint_final_net_worth` → residual counted **once**. The trajectory chart +
  break-even reconstruct from `traditional+roth+taxable` and pick it up once via
  `taxableBalance` (that's why it's in both, not just netWorth). `heir_benefit`/
  `total_tax_savings` are pre-residual but not used for any headline (dashboard recomputes
  tax savings from per-year sums, which already carry the held-back tax diff). **Explainability
  surfaces added:** a default-hidden "Held-Back RMD Advantage" year-by-year column
  (cumulative `heldBackResidual`), a named "+ Held-back RMD tax advantage" line in both the
  Lifetime-Wealth and Legacy-to-Heirs tooltips (so the taxable breakdown reconciles instead
  of the residual hiding inside the taxable balance), and the taxableBalance column
  description. **GI scope note:** the residual also runs for GI clients (all engine branches);
  held-back is validated for growth, and GI Story Mode strategy legacy is income-base-driven
  (doesn't read the residual), but a GI client WITH a held-back balance would carry it in
  `taxableBalance` → the GI-legacy PDF/baseline reconstruction would absorb it. Untested for
  GI; scope to growth if a GI held-back case ever appears.

### Tier 3 (NOT built) — the "real bucket" (absolute levels only)
The held-back IRA's own **balance** is still not in the absolute net-worth totals / chart
(both sides ~$9M low on the origin case). This is a WASH in the delta (identical both sides),
so the headline is correct without it; it only matters if advisors show clients the absolute
net-worth chart/levels rather than the delta. Deliberately NOT built (2026-07-08 decision):
folding it in would dilute the % denominator and inflate totals for no delta gain. Build only
if advisors start pitching off absolute levels. `rmd_treatment` still applies to the slice's
RMDs only; the held-back RMDs are residual/income-only.

---

## 6. Other fixes shipped this session (all on main)

- **Rider Fee PDF column (GI)** — GI PDF year-by-year tables now show a Rider Fee column
  (`showRiderFee`), matching the on-screen toggle + the Growth PDF. (`app/api/generate-pdf`,
  `templates/gi-pdf-template.html`)
- **AUM split display bug** — Growth report's Account Summary + lifetime-wealth tooltip
  showed premium/bonus on the FULL IRA under an AUM split; now use `rothSidePortion` (the
  annuity slice). Display-only. (`components/report/growth-report-dashboard.tsx`)
- **Admin refund netting** — advisor Net Price + revenue MRR/ARR/ARPU now subtract partial
  refunds (failed discount code → charged full → refunded to net ~$1930) via
  `amount_refunded` on the latest charge. Revenue route reuses its charge pagination.
  (`app/api/admin/advisors/route.ts`, `app/api/admin/revenue/route.ts`)
- **Withdrawals age labels** — recurring-withdrawal "age" fields labeled with the primary
  client's name (`ageSuffix`); it's a year-anchor, not per-spouse. (`withdrawals-table.tsx`)

---

## 7. Git note

Mid-session the branch was switched/rewritten on the user's end (`main` →
`fix/audit-batch-and-roth-cleanup`; a concurrent "batch of 10 fixes" commit `910d913`
rebased away a tooltip commit, which was re-applied). Everything is reconciled on `main`.
If commit hashes look reshuffled, verify by grepping the actual file contents, not the log.

---

## 8. Support-ticket context (for reference)

- **Greg Stopp** — partial-conversion cases (Dr. Policar / the $3M→$1.5M pattern). The
  held-back feature is the real answer to his "where does the other money go" question.
- **Mark Nichols** — leveraged-deduction advisor; the `additional_deductions` field (v58)
  was built for him. On-screen deduction column is toggleable.
- **Bill Schlip (Greg copy)** — the test client used to validate the held-back feature.
