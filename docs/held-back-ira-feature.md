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

## 5. KNOWN LIMITATION → the "real bucket" (next session)

The income-only overlay captures the held-back RMD **tax** correctly (so the **Additional
Lifetime Wealth headline is accurate**), but does **NOT** track the held-back IRA's own
**balance/wealth**:
- The held-back IRA's balance, its reinvested after-tax RMD proceeds, and its heir tax are
  NOT in the absolute net-worth totals (they're identical on both sides → cancel in the
  delta, so the headline is right; the tooltip now says this plainly).
- The **RMD Treatment** (reinvest/spend) setting applies to the **slice's** RMDs only — the
  held-back RMDs are income-only regardless.

**The real bucket (moderate build, ~half-day + verification):** model the held-back as an
actual IRA bucket combined into both sides (the `runAumOverlay`/`combineRothAndAum` pattern):
grow + RMD-deplete, reinvest after-tax proceeds into a side taxable account, heir tax, and
add its balance to `baseline_final_net_worth`/`blueprint_final_net_worth` + per-year rows.
Then the dashboard/tooltip/totals all reflect it automatically.
- **Tricky part:** tax the held-back RMDs at each side's **marginal** rate (to keep the
  bracket interaction) — do a with/without tax diff per year, subtract to get after-tax
  proceeds.
- **Alternative (higher risk, most elegant):** fix the growth engine so the premium bonus
  applies to the **converted amount** only, then advisors enter the **full IRA + partial
  convert** — everything correct in one sim, no held-back field. But it's a core engine
  change needing re-validation vs carrier illustrations.

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
