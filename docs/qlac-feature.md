# QLAC (Qualified Longevity Annuity Contract)

Origin: Mazhar Ahson, ticket `4cf52816` ("QLAC Impact on taxes", client "ali") and
the 2026-09-10 support call. He wants to show a client the RMD / IRMAA / Social
Security effect of moving the IRS-max QLAC premium out of the IRA and deferring
its income to 80–85, inside the same report as the Roth conversion.

## What a QLAC is (the rules we model)

| Rule | Source | Modeled |
|---|---|---|
| Premium cap $210,000 per person (2026, indexed in $10K steps from the SECURE 2.0 $200K base) | IRC §401(a)(9), IRS Notice 2025-67 | Yes — zod cap; 2× for MFJ (one per spouse) |
| Old 25%-of-balance cap | Repealed by SECURE 2.0 §202 | Not applied |
| Premium excluded from the Dec-31 balance the RMD divisor is applied to | Treas. Reg. §1.401(a)(9)-6 | Yes — carve-out below |
| Income must start no later than the month after the 85th birthday | same | Yes — `qlac_income_start_age ≤ 85` |
| Payouts are ordinary income | — | Yes — folded into non-SSI income |
| No cash value / surrender; cannot be converted to Roth | same | Yes — the slice never re-enters the IRA |
| Death benefit: return of premium (premium − payouts) or life-only | same | Yes — `qlac_death_benefit` |
| Joint-life (spouse continuation), period-certain, COLA/increasing payouts | carrier options | **Not modeled** (level single/joint payout through the horizon) |
| Purchase in a later year than projection start | — | **Not modeled** (year 1 only) |
| Widow analysis interaction | — | **Not modeled** (widow module runs on the raw client) |

## Inputs (`clients` table, all nullable — null premium = off)

- `qlac_premium` (cents) — capped at the IRS limit and at the IRA balance
- `qlac_income_start_age` — null → 85
- `qlac_annual_income` (cents/yr) — the carrier's quoted level income; required once a premium is entered
- `qlac_death_benefit` — `return_of_premium` (default) | `none`
- `qlac_in_baseline` — the client already owns it → apply to the do-nothing side too

UI: **4. Tax Data → "QLAC" checkbox** (next to RMD Treatment / Held-back IRA), in
the client form and both report input panels.

## How it runs — `lib/calculations/utils/qlac.ts`

Same shape as the held-back IRA overlay: no engine loop edits.

1. **Pre-sim `applyQlacToClient`** — subtract the premium from
   `qualified_account_value` (so every engine's `boyIRA`, i.e. the RMD base AND the
   conversion cap, is already net of it, and the FIA premium bonus is never credited on
   it) and merge the payout schedule into `non_ssi_income` so the existing
   Other-Income → `computeTaxableIncomeWithSS` path prices it in the right brackets,
   SS-torpedo and IRMAA MAGI. Runs after `applyHeldBackIraRmd` so both streams land in
   the same table. In `projections/route.ts` the strategy always gets this; the baseline
   only with `qlac_in_baseline`, and the baseline is re-run on its own inputs whenever
   the two sides start from different IRAs (`needsOwnBaseline`, same as AUM). The AUM
   slice is cut from the carved IRA (premium comes off the top first).
2. **Post-sim `applyQlacOverlay`** on the combined formula rows (and baseline rows when
   `qlac_in_baseline`):
   - `qlacPayout` — breakout of this year's payout (already inside `otherIncome`; the
     table nets it out of "Other Income (All)" like `externalRmd`)
   - `qlacDeathBenefit` — EOY `max(0, premium − Σ payouts)` (0 for life-only), added to
     `netWorth` as its own bucket: **netWorth = trad + roth + taxable + qlacDeathBenefit**
     (audit invariant updated)
   - `qlacReinvested` — the after-tax payouts banked per `rmd_treatment`
     (reinvested grows at `baseline_comparison_rate`, cash flat, spent → 0 and the
     after-tax amount goes to `cumulativeDistributions`), folded into `taxableBalance`
     and `netWorth`. After-tax uses the held-back residual's floor-position marginal
     method (`afterTaxHeldBackRmd`): the payout is mandatory income stacked below any
     conversion.
   - `heirBenefit` is re-priced with the death benefit on each side.
3. **Heir tax** — the unrecovered premium is IRD, taxed at the heir rate like a
   Traditional balance. `projections.{baseline,blueprint}_final_qlac_death_benefit`
   carry the final-row value; every `final_traditional × heirRate` surface adds it
   (growth/GI dashboards, presentation mode, summary + GI breakdown tables, PDF,
   chart transform, client/scenario list routes, client + results pages, chat tool,
   story generator).

## Story mode

New triggers `qlac_purchase` (year 1: premium leaves the RMD base, income promise,
ROP/life-only clause, baseline comparison) and `qlac_income_start` (first payout:
taxable income, IRMAA tier, DB draw-down). The `rmd_age` card quotes the RMD
reduction vs the full-IRA baseline; the setup card lists the QLAC; the legacy card
adds the remaining death benefit.

## Verification

- `lib/calculations/__tests__/audit/qlac-theory.test.ts` (in `npm run test:audit`):
  off = byte-identical across all three engines; carve-out + bonus-on-remainder;
  RMD at start age = baseline RMD × (IRA − P)/IRA with no conversions; payout
  timing/taxation; ROP schedule; banking per treatment; netWorth composition;
  `qlac_in_baseline`; premium clamp; start age past horizon; composition with the
  held-back IRA.
- Golden report fixtures unchanged (51/51). Reconcile-table breaches unchanged
  (288, pre-existing F2 documentation).
- `scripts/qlac-smoke.ts` (untracked) prints Ali's case: RMDs at 75 fall $17K, IRMAA
  drops a tier at 83–86, $60K/yr taxable income from 85.

**Carrier verification (2026-09-23):** Mazhar's two Global Atlantic ForeCertain quotes
(Forethought; $210K, Single Life w/ Cash Refund, cost basis $0 — D77W1D income from 75 at
$2,768.84/mo, D77W5H from 80 at $5,304.64/mo) are locked as section 8 of
`qlac-theory.test.ts`: cumulative payments and cash-refund run-off match to the cent,
income starts in the quoted calendar year, every dollar is taxable, and the RMD base is
exactly (IRA − $210K). This carrier begins payments on Jan 1 of the start-age year, so the
overlay's full-first-year assumption is exact for it. Standalone:
`scripts/qlac-verify-forecertain.ts`. Advisors enter the carrier's **monthly** figure × 12.

## Known limitations

- Level payouts only: no joint-life, period-certain or annual-increase (COLA) options;
  income runs to the end of the projection regardless of a spouse's death.
- Purchase is modeled in year 1 only.
- `multi-strategy.ts` (unmounted) and `analysis/sensitivity.ts` (legacy engine only) run
  the raw client — no QLAC or held-back overlay — same pre-existing pattern as held-back.
- Held-back IRA + QLAC together: each overlay prices its own after-tax stream at the
  bracket floor (assumes the other is stacked above it), so both after-tax banked figures
  are slightly overstated in overlap years. Display/net-worth only; bounded.
- The IRS cap is enforced by the form refine AND by `getQlacPremium` (× 2 for MFJ); a
  direct API update with an over-cap premium is silently clamped rather than rejected.

## Deploy order

Run `supabase/migrations/20260918120000_clients_qlac.sql` (clients + projections
columns) **before** merging: the client list/scenario/chat selects name the new
projection columns. Projection inserts only write them for QLAC clients, so a
non-QLAC client keeps working either way.
