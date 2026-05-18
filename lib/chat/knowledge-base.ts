/**
 * Knowledge base for the in-app advisor assistant.
 *
 * Everything the model needs to answer questions about the platform, the
 * theory, the math, and the IRS data we use. Numbers are pulled directly
 * from /lib/data/* so the model never has to guess — when a number lands
 * here, it should match what the engine actually uses.
 *
 * Updating this:
 *   - If you ship a calculation change, update the relevant section here
 *     in the SAME commit. Drift between this doc and the engine is the
 *     thing we're trying to prevent.
 *   - If you change a default (heir tax rate, rate of return, inflation),
 *     update the "Engine assumptions" section.
 *   - If a new column ships, add it to "Year-by-year columns".
 *   - If an advisor question reveals a confusion pattern that keeps
 *     coming up, add it under "Common questions".
 *
 * Token budget: aim to keep this under ~8K tokens so prompt caching pays
 * off cheaply. Split into a second doc if it ever needs to grow much.
 */

export const KNOWLEDGE_BASE = `# Retirement Expert — How the platform works

## What we do in one paragraph

Retirement Expert is a Roth conversion planning tool for financial advisors. The advisor enters a client's situation (age, IRA balance, Social Security, other income, state) and the engine simulates two scenarios side by side: a **baseline** ("do nothing" — keep the Traditional IRA and take RMDs starting at 73) and a **strategy** (convert Traditional IRA dollars to a Roth IRA, optionally inside a fixed-index annuity or a managed AUM portfolio). The report shows the lifetime trade-off — taxes paid up front vs. taxes avoided later, plus what the heirs end up with.

## Baseline vs Strategy — the fundamental comparison

Both sides use the SAME growth rate and the SAME life expectancy. The only thing that differs is what the client does with the IRA dollars:

- **Baseline** = Traditional IRA stays as-is. RMDs start at age 73 using the IRS Uniform Lifetime Table. Every RMD dollar is taxed at the client's marginal rate that year.
- **Strategy** = Convert some/all of the Traditional IRA to a Roth (paying the tax up front in lower-tax years), so future RMDs are smaller or eliminated.

If an advisor says "baseline and strategy aren't a fair comparison," 99% of the time it's because \`rate_of_return\` and \`baseline_comparison_rate\` are out of sync — they MUST be equal for the comparison to be fair. The form auto-syncs them; if a client has stale data, advisors can refresh by editing the rate.

## Product types

There are four product modes the strategy can run on:

1. **Generic Growth Product** — a generic fixed-index annuity wrapper. User-configurable bonus, surrender schedule, penalty-free percent.
2. **Growth FIA presets** — Short-Term Cap, Phased Bonus, Vesting Bonus, High-Bonus Long-Term, High-Bonus Medium-Term. Each has hardcoded bonus %, surrender, and penalty-free that we lock so the label matches the math. Editable via "Custom Products" if an advisor needs to deviate.
3. **Guaranteed Income (GI)** — Generic Income, Simple Roll-up, Compound Roll-up, Flat-rate Compound. These have a roll-up rate, payout factor table, rider fee, and a 4-phase model (deferral → income start → ongoing → death).
4. **Custom Products** — advisor-built products in Settings → My Products. Can be based on any of the above engine presets but with the advisor's own bonus / surrender / state-specific overrides. The advisor's saved values always win over the engine preset defaults.

**AUM mode** is a fifth path: instead of running the strategy inside an annuity, route 100% of the IRA into a managed-portfolio bucket (fee, dividend yield, turnover). Toggle in New Account → AUM Allocation. % to AUM = 100 means the product picker is effectively a no-op.

## Conversion types

- **optimized_amount** — convert as much as possible each year while staying inside the target tax bracket (\`max_tax_rate\`). Stops once the IRA is empty.
- **partial_amount** — same year-by-year logic as optimized, but stops once cumulative conversions hit \`target_partial_amount\`.
- **fixed_amount** — convert exactly \`fixed_conversion_amount\` every year (subject to remaining IRA balance).
- **full_conversion** — convert the entire IRA in year 1. Big tax hit up front, zero RMDs after.
- **no_conversion** — strategy = baseline. Useful for showing "what if we don't do anything" as the recommendation.

## Tax mechanics

- **Marginal tax bracket** = the rate on the NEXT dollar of taxable income. Used for "what bracket are we in?" questions.
- **Effective tax rate** = total tax / total taxable income. Always lower than marginal because lower brackets are at lower rates.
- **Gross-up** (when \`tax_payment_source = "from_ira"\`) = the engine pulls extra dollars from the IRA to fund the conversion tax. To convert and end up with $100K in the Roth at a 22% marginal rate, the engine pulls ~$128K from the IRA: $100K goes to Roth, ~$28K goes to the IRS.
- **External tax payment** (when \`tax_payment_source = "from_taxable"\`) = the conversion tax comes out of the taxable account, not the IRA. The whole IRA pull goes to the Roth. More tax-efficient if the taxable account has the cash.
- **Tax on RMDs** is the MARGINAL tax caused by the RMDs themselves — the difference between the tax owed with the RMD vs the tax that would be owed without it. It's NOT the total tax for the year (that also includes tax on Social Security, pensions, etc.). The PDF Distributions summary and the dashboard's Lifetime Tax Cost tooltip both use the marginal version. The year-by-year table's "Total Tax" column is the full year's fed+state — that one is total, and it's labeled accurately.

## RMDs (Required Minimum Distributions)

- Start age is 73 (under SECURE 2.0). The engine uses the IRS Uniform Lifetime Table.
- RMD divisor at age 73 is 26.5; age 75 is 24.6; age 80 is 20.2; age 85 is 16.0; age 90 is 12.2. (See lib/data/rmd-factors.ts for the full table.)
- Annual RMD = prior-year-end Traditional IRA balance / divisor for current age.
- The strategy avoids RMDs to the extent it converts the IRA before age 73. A full conversion in year 1 → zero RMDs. A partial conversion → smaller RMDs.

## IRMAA (Medicare Income-Related Monthly Adjustment Amount)

- IRMAA is a Medicare Part B / D surcharge based on MAGI from 2 years prior (2-year lookback).
- 2026 single-filer tiers: standard premium up to $103K MAGI; +$840/yr at $103K; +$2,100/yr at $129K; +$3,360/yr at $161K; +$4,620/yr at $193K; +$5,040/yr at $500K+.
- Joint-filer thresholds are exactly 2x single. Surcharges are 2x single (per couple).
- The "IRMAA constraint" conversion option (\`constraint_type = "irmaa_threshold"\`) sizes each year's conversion to keep MAGI below the next IRMAA tier from age 63+ (since age-65 IRMAA is set by age-63 MAGI).
- IRMAA tiers are inflated 2.5% annually for years past 2026.

## Widow's penalty

When \`widow_analysis = true\` and the client is MFJ, the engine simulates one spouse passing away at \`widow_death_age\` (or a heuristic age if null). From that point on, the survivor files Single. Same income, narrower brackets → noticeably higher tax. The widow analysis surfaces how much extra tax is owed if conversions WEREN'T done before the first death. This is one of the strongest arguments for converting earlier when one spouse has materially worse health.

## Engine assumptions (defaults)

- **Rate of return**: 7% (editable). Both baseline and strategy use this — they're forced to be equal so the comparison is fair.
- **Inflation rate**: 2.5% (used for IRMAA tier indexing and standard deduction indexing past 2026; not currently used for income).
- **Heir tax rate**: 40% (editable). Applied to whatever Traditional IRA balance is left at end of projection — heirs get a 10-year window under SECURE Act so this is approximated as a flat marginal hit.
- **End age**: 100 by default.
- **LTCG rate**: 15%.
- **Heir treatment**: Roth and taxable accounts pass through tax-free. Only the Traditional IRA remainder takes the heir tax hit.

## IRS data we use (2026)

- **Federal brackets, single**: 10% to $11,925 → 12% to $48,475 → 22% to $103,350 → 24% to $201,775 → 32% to $256,175 → 35% to $641,475 → 37% above.
- **Federal brackets, MFJ**: 10% to $23,850 → 12% to $96,950 → 22% to $206,700 → 24% to $403,550 → 32% to $512,350 → 35% to $768,450 → 37% above.
- **Standard deduction (2026)**: $16,100 single / $32,200 MFJ / $24,150 HoH. Plus $2,000 per filer age 65+ if single; $1,600 per spouse age 65+ if married.
- **RMD start age**: 73.
- **Social Security taxability**: standard tier-1 ($25K provisional single / $32K joint) and tier-2 ($34K / $44K) — up to 85% of SS becomes taxable above tier-2.

All values above match \`lib/data/federal-brackets-2026.ts\`, \`lib/data/standard-deductions.ts\`, \`lib/data/irmaa-brackets.ts\`, \`lib/data/rmd-factors.ts\`. If an advisor asks "what brackets are you using?" — these are the numbers.

## The report dashboard — what each card means

- **Lifetime Wealth** = final net worth (Traditional + Roth + Taxable at end of projection) minus heir tax on the remaining Traditional. Both sides computed the same way. Strategy minus baseline = the lifetime wealth advantage from converting.
- **Legacy to Heirs** = same as Lifetime Wealth but framed as what the heirs receive after taxes on the inherited IRA. Roth and taxable pass through tax-free.
- **Lifetime Tax Cost (incl. heir tax)** = every tax dollar paid across the projection: income tax, IRMAA surcharges, the 10% early-withdrawal penalty if any, plus the heir's tax on whatever Traditional balance remains. Lower is better.
- **Forced Distributions** = total RMDs the client is forced to take across the projection. Strategy is usually zero or much smaller because conversions drain the Traditional IRA before 73.

The Lifetime Tax Cost tooltip splits taxes into matching buckets on both sides: Tax on RMDs (marginal) + Other baseline income tax + IRMAA + Heir on baseline; Conversion tax + Tax on remaining RMDs + Other strategy income tax + IRMAA + Heir on strategy. Apples to apples by design.

## Year-by-year table columns (what each means)

The "Adjustable Columns" picker exposes 30+ columns. The ones advisors ask about most:

- **Year / Age** — always shown, frozen left.
- **Conversion** — amount converted from Traditional to Roth that year.
- **RMD** — required minimum distribution that year (zero in years before 73 OR if the IRA is empty).
- **Total Tax** — full federal + state + IRMAA + early-penalty for the year. This is everything the IRS and state collect.
- **Fed Tax (Conversions)** — federal tax attributable to the conversion alone. Different from Total Tax — Total Tax also includes tax on SS, RMDs, other income.
- **Total Fed Tax on IRA W/D** — combined federal tax on conversions AND RMDs. Use this with "Fed Tax (Conversions)" to see what the conversion alone costs.
- **Federal Tax / State Tax** — split of the total.
- **Tax Bracket** — marginal bracket the client hits that year (e.g., 22, 24).
- **IRMAA Tier / IRMAA Amount** — which Medicare tier the client lands in + the surcharge dollars.
- **Taxes Paid from IRA** — only nonzero when \`tax_payment_source = "from_ira"\`. The IRA dollars pulled to fund the conversion tax (the "gross-down" portion).
- **Conversion Tax (External)** — only nonzero when \`tax_payment_source = "from_taxable"\`. The dollars pulled from the taxable account to fund conversion tax.
- **Traditional IRA / Roth IRA / Taxable Account / Net Worth** — end-of-year account balances.
- **Total Income / MAGI / AGI / Taxable Income / Std Deduction** — the income roll-up that feeds tax calc.

A user-level "Favourite Columns" default lives in Settings → My Columns. New clients open with whatever the advisor picked there.

## Common questions and confusions

**"Tax on RMDs in the year-by-year doesn't match the summary's Tax on RMDs."**
The year-by-year column is now labeled "Total Tax" (full year fed+state). The PDF summary and the dashboard tooltip's "Tax on RMDs" use the marginal version — the tax dollars caused by the RMDs alone, isolated from background tax on SS and other income. Both are correct, they're measuring different things.

**"Full conversion makes the Traditional IRA balance go slightly negative."**
The engine uses cents internally. Tiny rounding artifacts (single-digit cents) can show up after a full conversion. The math is correct; the display can round to $0 if it's confusing.

**"My custom product's bonus keeps reverting to a different number."**
Fixed on 2026-05-18. When a custom product is loaded (\`custom_product_id\` set), all fields the user defined are now sticky — no engine-preset default ever overwrites them.

**"The bonus field is greyed out / locked."**
Locked fields exist for SYSTEM PRESETS only — to keep the preset's label in sync with its math. Custom products unlock everything; if it's locked on a custom product, that's a bug.

**"Why is the year-by-year Federal Tax higher than the bracket would suggest?"**
The bracket is MARGINAL — the rate on the next dollar. Federal Tax is the total tax owed across all brackets, which is always lower than (marginal × taxable income) and usually higher than (lowest bracket × income). If a client converts $100K into the 22% bracket, the tax isn't $22K — it's roughly $13K because most of the income falls into the 10% and 12% brackets first.

**"Why does IRMAA show up but conversions don't trigger it?"**
The IRMAA constraint (\`constraint_type = "irmaa_threshold"\`) sizes conversions to stay under the next tier. If the advisor isn't using that constraint, conversions CAN push MAGI into a higher IRMAA tier — the engine will show the surcharge in the year-by-year IRMAA column. That's expected; it's not a bug.

**"The Conversion Cost & Payback page shows when the Roth balance exceeds the cumulative tax — that's not real breakeven."**
Correct. The TRUE tax-payback breakeven is when cumulative baseline tax (RMD-driven) exceeds cumulative strategy tax (conversion-driven). The dashboard's Breakeven chart shows this. The PDF page currently shows the weaker Roth-vs-tax framing.

## When to escalate to a support ticket

Offer to file a ticket when:
- The advisor reports a number that's clearly wrong (math doesn't reconcile, a label clearly mismatches its value).
- A feature isn't working at all (button does nothing, save fails, can't open report).
- The advisor describes data that should exist but doesn't (their client is missing, a custom product is missing).

Don't file a ticket when:
- The advisor doesn't understand WHY a number is what it is — explain it instead.
- The advisor wants a feature added that doesn't exist — acknowledge it but don't auto-file; major feature requests go through a different channel.
- The advisor needs help configuring a setting — walk them through it.

Always ask "Want me to file a ticket on your behalf?" before calling the \`create_support_ticket\` tool. Never silently file.
`;
