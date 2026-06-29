# In-Flight Engine Changes — heads-up for the audit agent

Notes left by other agents who pushed engine changes **while an audit was in
progress**, so a re-baseline / output diff doesn't look like a regression you
introduced. Newest first.

---

## 2026-06-29 — non-SSI income now SUMS all same-year streams (pushed to `main`)

**Made & pushed by:** Claude Code (support-ticket session — Mike Catone /
Guillermo Silesky).

**File:** `lib/calculations/utils/income.ts`

**Bug:** `getNonSSIIncomeForYear` and `getTaxExemptIncomeForYear` looked up
income with `.find(e => e.year === year)`, which returns only the **first**
income row for a year. The income table deliberately stores each income stream
(pension / rental / annuity / wages / …) as its **own same-year row** (see
`components/clients/income-table.tsx` — filling one type preserves the others).
So any client with 2+ income streams in the same year had income
**undercounted in EVERY engine** (baseline, formula, growth-formula, GI, the
marginal-conversion-tax and marginal-rmd-tax helpers, and the PDF route). The
optimizer then over-converted into phantom bracket room.

**Fix:** `filter(e => e.year === year).reduce(...)` — sum all matching rows.

**Blast radius:** **single-row-per-year and flat-field clients are
byte-identical** (sum of one element = that element). Only clients with 2+ rows
in the same year change. For those, both baseline and strategy income rise, and
the optimized/partial conversion sizing drops (less phantom bracket room).

**Example (Mike Catone, single, 67):** pension $24,612 was counted; rental
$13,056 + annuity $12,960 were dropped. Year-1 optimized conversion
**$123,376 → $97,360**; total taxable income that fills the 24% ceiling is
unchanged (~$168,148) — only the conversion-vs-base split corrected.

**Also shipped:**
- `PRODUCT_CONFIG_VERSION` 67 → **68** (`app/api/clients/[id]/projections/route.ts`) so cached projections recompute.
- New regression case **Test 2b** in `lib/calculations/__tests__/income-lookup.test.ts` (multi-stream-per-year sum, incl. tax-exempt).

**Note:** the pre-existing `income-lookup.test.ts` Test 3 failure ("Diff should
be ~$70K, got $92,341") is **unrelated** to this change — it fails identically
on the pre-change code (confirmed via git stash). It's a stale assertion band,
not a real breach.
