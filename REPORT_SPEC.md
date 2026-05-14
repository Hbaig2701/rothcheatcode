# Report Spec

The single source of truth for what every headline number on every report
surface means and how it is calculated. Treat changes to this document as
deliberate decisions, not implementation details — every formula here
has at least one advisor reading it on a printed PDF.

When a number is changed, **the spec is updated first**, then the code,
then the fixture tests (Phase 3, see roadmap at the bottom). Reverse
order is how we ended up with the May 1 "Tax on RMDs" change shipping
without anyone noticing it would diverge from the year-by-year column.

---

## Audit window

This audit covers the **Growth FIA** report path. The Guaranteed
Income (GI) variant has its own dashboard / presentation / breakdown
table set with similar but not-identical semantics — flagged at the
end as a follow-up audit item.

---

## 1. Surfaces

| # | Surface | File | When it's used |
|---|---|---|---|
| A | Main report dashboard (in-app) | `components/report/growth-report-dashboard.tsx` | Default view of `/clients/[id]/results` |
| B | Presentation mode (in-app) | `components/report/presentation-mode.tsx` | Full-screen client-facing view triggered from the dashboard |
| C | Summary comparison table (in-app) | `components/report/summary-comparison-table.tsx` | Inline table inside the dashboard's wealth section |
| D | Year-over-year tables (in-app) | `components/report/year-over-year-tables.tsx` | Tabbed deep-dive table on the dashboard |
| E | Downloadable PDF — summary pages | `app/api/generate-pdf/route.ts` + `templates/pdf-template.html` | "Export PDF" button output |
| F | Downloadable PDF — year-by-year tables | same | Pages 5–8 of the PDF |
| G | Engine summary metrics | `lib/calculations/engine.ts` `calculateSummaryMetrics` | Consumed by training playgrounds + multi-strategy comparison; NOT used by the production report |
| H | Multi-strategy comparison metrics | `lib/calculations/multi-strategy.ts` | Consumed by the strategy-comparison surface |

Of these, A–F are advisor-facing per-client report numbers. G and H feed
internal/training surfaces. Inconsistency between (A–F) and (G–H) is
acceptable as long as G/H are clearly internal. Inconsistency *within*
A–F is what advisors see and complain about.

---

## 2. Headline numbers

For each: canonical definition, formula in code, every surface that
displays it, and the consistency verdict.

### Lifetime Wealth (per scenario)

**Canonical definition:** the projected net wealth the household ends
up with after all taxes have been paid and the remaining traditional
IRA balance has been heir-taxed at the configured rate. Apples-to-apples
between baseline and strategy because both use the same formula on the
same `final_net_worth` figure.

**Canonical formula:**

```
LifetimeWealth = projection.<scenario>_final_net_worth
               - round(projection.<scenario>_final_traditional × heir_tax_rate)
```

The engine has already deducted federal/state tax, IRMAA, and conversion
costs from `final_net_worth` (those flow out of the taxable bucket as
they're paid each year). The only extra subtraction at the end is the
heir tax on whatever traditional IRA remains.

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| A. Dashboard | `growth-report-dashboard.tsx:145, 169` | `final_net_worth − heir_tax_on_traditional` | ✅ canonical |
| B. Presentation mode | `presentation-mode.tsx:65–73` | same (fixed 2026-05-14) | ✅ canonical |
| C. Summary comparison table | `summary-comparison-table.tsx:45, 48` | same | ✅ canonical |
| E. PDF summary | `app/api/generate-pdf/route.ts:849, 877` | same | ✅ canonical |
| G. Engine summary metrics | `lib/calculations/engine.ts:208–209` | `total_distributions − total_costs` | ⚠️ different (internal only) |
| H. Multi-strategy | `lib/calculations/multi-strategy.ts:49` | `lastYear.netWorth` (no heir tax) | ⚠️ different (internal only) |

**Verdict:** A–E aligned ✅. G/H diverge but are isolated to internal
surfaces. Do **not** propagate G/H formulas onto advisor-facing pages.

---

### Net Improvement / Additional Lifetime Wealth

**Canonical definition:** how much better the strategy's Lifetime
Wealth is than the baseline's. Sign convention: positive = strategy
ahead.

**Canonical formula:**

```
NetImprovement = LifetimeWealth(strategy) − LifetimeWealth(baseline)
```

**Surfaces and consistency:** Inherits from Lifetime Wealth — same
status. ✅ across A–E.

---

### Legacy to Heirs (per scenario)

**Canonical definition:** the after-heir-tax dollar amount that passes
to heirs at end-of-projection. Roth balances pass tax-free; remaining
traditional IRA is taxed at `heir_tax_rate`; taxable accounts pass
through (assumed step-up basis).

**Canonical formula:**

```
NetLegacy = projection.<scenario>_final_net_worth
          - round(projection.<scenario>_final_traditional × heir_tax_rate)
```

Note: this is **the same formula as Lifetime Wealth** in the current
spec. They display under different labels because Legacy is the
narrower framing (just the inheritance) while Lifetime Wealth is meant
to be "everything the household ends up with." When the strategy has
no during-life distributions outside of conversions (the typical case),
the two numbers are identical.

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| A. Dashboard | `growth-report-dashboard.tsx:132, 167, 483` | same | ✅ canonical |
| B. Presentation mode | `presentation-mode.tsx:225` | same | ✅ canonical |
| C. Summary comparison table | `summary-comparison-table.tsx:29, 40, 78` | same | ✅ canonical |
| D. Year-over-year tables | `year-over-year-tables.tsx:178–181` | per-year `traditional × 0.6 + roth + max(0, taxable)` | ⚠️ uses local 40% rate instead of `client.heir_tax_rate` |
| E. PDF summary | `app/api/generate-pdf/route.ts` | same | ✅ canonical |

**⚠️ Inconsistency:** the year-over-year per-year Legacy column hard-codes
`heirTaxRate = 0.40` ([year-over-year-tables.tsx:177](components/report/year-over-year-tables.tsx#L177))
instead of reading `client.heir_tax_rate`. If an advisor has overridden
the heir tax rate (e.g. set to 32%), the per-year column will show
different numbers than the summary card. Likely never noticed because
40% is the default.

---

### Tax on RMDs

**Canonical definition:** the **marginal incremental** federal + state
tax caused by the RMDs alone. Computed as `tax_with_rmd − tax_without_rmd`
per year, summed. Excludes background tax on Social Security, pension,
W-2 income that would be owed regardless. Designed to be the
apples-to-apples comparator to "Tax on Conversions" in the strategy
column.

**Canonical formula:**

```
TaxOnRMDs = sum over years where rmd > 0 of:
            max(0, (year.federalTax + year.stateTax)
                  - tax_recomputed_assuming_no_RMD_this_year)
```

Implemented as `computeMarginalRMDTax` in
[`app/api/generate-pdf/route.ts:747`](app/api/generate-pdf/route.ts#L747).

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| E. PDF summary "Tax on RMDs" | `app/api/generate-pdf/route.ts:856, 1036` | `computeMarginalRMDTax(baseline_years, client)` | ✅ canonical |
| F. PDF year-by-year baseline "Total Tax" column | `route.ts:354, 141` | sum of `year.totalTax` (full bill) | ✅ correctly labeled "Total Tax" — different concept |
| D. Year-over-year baseline "Total Tax" column | `year-over-year-tables.tsx:141` | sum of `year.totalTax` | ✅ correctly labeled "Total Tax" — different concept |
| A. Dashboard | not displayed as a standalone metric | — | n/a |
| B. Presentation mode | not displayed | — | n/a |

**⚠️ Historical regression:** before the May 1, 2026 commit `140e319`
(*"Distributions section split per scenario with honest tax math"*), the
PDF summary's "Tax on RMDs" used `baseTax` (sum of `federalTax +
stateTax` across all baseline years) — which **matched** the year-by-year
total. The May 1 change switched it to the marginal formula above so it
could be compared apples-to-apples with "Tax on Conversions." That's
the change Jorge noticed (ticket `f9c6333f`). The relabel of the
year-by-year column from "Taxes (IRA)" → "Total Tax" (today, commit
`84ba34f`) is the resolution: the labels now honestly describe the two
different things. The summary number does NOT and is not supposed to
match the year-by-year column total for clients with non-RMD income
(SS, pension, etc.).

**Resolved:** the current "two views, two labels" arrangement is the
accepted design. Confirmed by Jorge L. Tola on 2026-05-14 after walking
through Paul George's report — he understood that page 3 = marginal
RMD-attributable tax only, page 6 = full tax bill in those years
(RMD tax + tax on Social Security + state tax + IRMAA). No further
change needed to satisfy this case.

A separate "Tax on RMDs (marginal)" column on the year-by-year table
remains a *possible enhancement* if more advisors hit the same
confusion, but is no longer pending — labels do the work.

---

### Tax on Conversions

**Canonical definition:** the marginal federal + state tax owed because
of the Roth conversions themselves. Excludes background tax on Social
Security, RMDs (in pre-conversion years), and pension. The engine emits
this directly per year as `federalTaxOnConversions` + `stateTaxOnConversions`.

**Canonical formula:**

```
TaxOnConversions = sum over years of:
                   year.federalTaxOnConversions
                 + year.stateTaxOnConversions
```

Implemented inline in
[`growth-report-dashboard.tsx:156`](components/report/growth-report-dashboard.tsx#L156)
and
[`app/api/generate-pdf/route.ts:867`](app/api/generate-pdf/route.ts#L867).

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| A. Dashboard | `growth-report-dashboard.tsx:156` | sum of per-year fed+state on conversions | ✅ canonical |
| E. PDF summary "Tax on Conversions" | `route.ts:867, 1051` | same | ✅ canonical |
| F. PDF year-by-year strategy "Tax from IRA" column | `route.ts:354` | sum of `year.taxesPaidFromIRA` | ⚠️ different — see note |

**⚠️ Note:** "Tax on Conversions" (marginal-tax) and "Tax from IRA"
(actual-dollars-pulled-from-the-IRA-to-fund-tax) are different quantities
when `tax_payment_source = 'from_taxable'` (engine doesn't pull from IRA;
Tax from IRA = $0 every year, while Tax on Conversions is non-zero).
This is correct by design but worth knowing — they're labeled differently
and shouldn't be expected to match.

---

### Forced Distributions

**Canonical definition:** the gross dollar value of IRS-Required
Minimum Distributions across the projection. Pre-tax. Baseline is the
sum of RMDs across all baseline years; strategy is typically $0
(conversions empty the IRA before age 73/75).

**Canonical formula:**

```
ForcedDistributions(scenario) = sum over years of year.rmdAmount
```

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| A. Dashboard "Forced Distributions" | `growth-report-dashboard.tsx:542` (sum of `baseRMDs`) | `sum(baseline_years, "rmdAmount")` | ✅ canonical |
| E. PDF summary "Required RMDs (forced)" | `templates/pdf-template.html:478` | same (`baseRMDs` from route.ts) | ✅ canonical |
| D. Year-over-year baseline "Dist.(IRA)" | `year-over-year-tables.tsx:128` | per-year `year.rmdAmount` | ✅ canonical |

---

### Premium Bonus Received

**Canonical definition:** the carrier bonus dollars credited to the
IRA on initial deposit. Calculated once as `qualified_account_value ×
bonus_percent`.

**Canonical formula:**

```
PremiumBonus = client.qualified_account_value × (client.bonus_percent / 100)
```

Only meaningful for the strategy side (baseline assumes the existing
account, no fresh transfer). Baseline shows `$0`.

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| A. Dashboard | `growth-report-dashboard.tsx:794` (display only) | derived inline | ✅ canonical |
| E. PDF summary "Premium Bonus Received" | `templates/pdf-template.html:505` | from `route.ts` `premiumBonusDollars` | ✅ canonical |

---

### Net Out-of-Pocket Tax (after bonus)

**Canonical definition:** the actual tax cost the client absorbs after
crediting the premium bonus.

- For baseline: equals `Tax on RMDs` (no bonus to credit).
- For strategy: equals `Tax on Conversions − Premium Bonus`. May go
  negative if the bonus exceeds the conversion tax (rare but possible).

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| E. PDF summary "Net Out-of-Pocket Tax (after bonus)" | `route.ts:977–978, 1054` | as defined | ✅ canonical |
| A. Dashboard | not surfaced as a single labeled metric | — | n/a |

**Discrepancy concern:** since the dashboard doesn't show this row, an
advisor flipping between PDF and dashboard sees a tax line on the PDF
that has no counterpart on the dashboard. Could be added to the
dashboard for symmetry, or removed from the PDF for simplicity.
Decision deferred.

---

### After-Tax Distributions Spent

**Canonical definition:** dollars the client actually receives in their
bank account during life from forced/scheduled distributions, after
income tax. Baseline only — strategy does not "spend" conversions
(they stay in the Roth).

**Canonical formula:**

```
AfterTaxDistributions(baseline) =
  rmd_treatment == 'spent'
    ? lastBaselineYear.cumulativeDistributions
    : baseRMDs - baseTax
```

Implemented in [`route.ts:1021`](app/api/generate-pdf/route.ts#L1021).

**Surfaces and consistency:**

| Surface | File:line | Formula | Match? |
|---|---|---|---|
| E. PDF summary "After-Tax Distributions Spent" | `route.ts:1021, templates/pdf-template.html:517` | as defined | ✅ canonical |
| A. Dashboard "Forced Distributions (After-Tax)" | `growth-report-dashboard.tsx:542` | toggles label based on `rmd_treatment`, value matches | ✅ canonical |

---

### Heir Tax Rate (input field)

**Canonical:** `client.heir_tax_rate` (percent, e.g. `40` for 40%).
Default 40%.

**⚠️ Inconsistency:** [`year-over-year-tables.tsx:177`](components/report/year-over-year-tables.tsx#L177)
hard-codes `0.40` for its per-year Legacy to Heirs calculation,
ignoring the client's setting. Every other surface respects the input.

---

## 3. Inconsistency log (action items)

In priority order:

1. **`year-over-year-tables.tsx:177`** hard-codes `heirTaxRate = 0.40`
   for the per-year Legacy column, ignoring `client.heir_tax_rate`.
   *Fix:* read from client config like all other surfaces. Risk: low.
   Effort: tiny.

2. **PDF "Net Out-of-Pocket Tax (after bonus)"** row has no dashboard
   counterpart. *Fix:* either add the row to the dashboard's wealth
   section for symmetry, or strip it from the PDF for simplicity.
   *Recommendation:* add to dashboard so the PDF remains the
   comprehensive reference. Effort: small.

3. ~~Year-by-year `Total Tax` column total ≠ summary `Tax on RMDs`.~~
   **Resolved 2026-05-14**: today's relabel (commit `84ba34f`) made
   the labels honest. Jorge confirmed the two-views framing is clear
   to him. Adding a separate "Tax on RMDs (marginal)" column on the
   year-by-year remains an optional future enhancement but is not a
   pending fix.

4. **Engine `calculateSummaryMetrics` (G) and multi-strategy (H) use
   different `LifetimeWealth` formulas** than the production reports.
   Acceptable while these surfaces stay internal (training playgrounds,
   strategy compare). *Watch item:* if either surface ever becomes
   advisor-facing, port to the canonical formula first.

5. **GI report variant** (`gi-report-dashboard.tsx`,
   `gi-presentation-mode.tsx`, `gi-summary-breakdown-table.tsx`,
   `gi-year-over-year-tables.tsx`, `templates/gi-pdf-template.html`)
   uses parallel but not-identical formulas. Out of scope for this
   audit. Suggest a follow-up audit for GI specifically.

---

## 4. Roadmap

This document lives at the repo root and is the spec. Phase order:

- **Phase 1 (now):** This document. Map every number, flag mismatches.
- **Phase 2:** For each item in §3, get a decision (keep / rename /
  reconcile / hide). Update spec to reflect the decision.
- **Phase 3:** Add fixture tests under `lib/calculations/__tests__/`
  with three example clients (Growth + bonus, GI, widow case). Each
  test asserts the canonical value of every headline number from §2.
  Any future code change that moves these values fails CI and forces
  a deliberate spec update.
- **Phase 4:** GI audit (mirror this doc's structure for the GI
  surfaces).
- **Phase 5:** Surface the spec to advisors as in-app tooltips so
  they can self-serve "what does this number mean?" without filing a
  ticket.

---

## How to use this doc

- **Before changing a calculation:** find the relevant headline number
  in §2 and update the spec there *first*, including a rationale entry
  in §3 if the change creates an inconsistency.
- **When an advisor files a "the numbers don't match" ticket:** look in
  §2 and §3 for the answer before touching code. The vast majority of
  these tickets are documentation problems, not bugs.
- **Before shipping any change to a number on an advisor-facing
  surface:** confirm a fixture test in §Phase 3 covers it, and update
  the test's expected value as part of the same commit (so no future
  change is silent).
