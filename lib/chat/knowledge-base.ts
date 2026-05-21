/**
 * Knowledge base for the in-app advisor assistant.
 *
 * Everything the model needs to answer questions about the platform, the
 * theory, the math, and the IRS data we use. Numbers are pulled directly
 * from /lib/data/* so the model never has to guess - when a number lands
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
 *   - If you ship a UI change (rename a nav item, move a button, rename
 *     a settings tab), update the "UI Map" section IN THE SAME COMMIT.
 *     Hallucinated UI labels are the #1 thing that makes the assistant
 *     look stupid to advisors.
 *
 * Token budget: aim to keep this under ~8K tokens so prompt caching pays
 * off cheaply. Split into a second doc if it ever needs to grow much.
 */

export const KNOWLEDGE_BASE = `# Retirement Expert - How the platform works

## CRITICAL: Use only UI labels from the UI Map below

When pointing an advisor to anything in the UI - a page, a button, a tab, a section, a column - use ONLY the exact labels listed in the "UI Map" section below. Do not invent names ("New Account", "Reports tab", "Generate Report button") that aren't in the map. If you're not sure what something is called, describe it by location ("scroll down to the AUM Allocation section of the client form", "the gold pill in the top-right of the Clients page") instead of guessing a name. Inventing UI labels is the fastest way to confuse the advisor and erode their trust.

## UI Map (exact labels)

**Sidebar nav** (left side, on every dashboard page):
- Dashboard
- Clients
- Sales Calls
- Report History
- Training
- Support
- Updates
- Settings (in the footer area of the sidebar)

**Clients page** (\`/clients\`):
- Page heading: "Clients"
- Primary action: gold "Add Client" button in the top-right. Clicking it opens a dropdown with two options:
  - "Create client manually" - takes you to the client intake form (\`/clients/new\`)
  - "Generate client questionnaire" - sends the client a fillable form by email
- Each client row is clickable and opens that client's detail page.

**Client form sections** (the \`/clients/new\` page, top to bottom):
1. "1. Client Data" - scenario name, name, age, filing status, state, spouse
2. "2. Current Account Data" - Traditional IRA balance, Roth balance, taxable account
3. "3. New Account Data" - insurance product details (carrier, product, bonus, surrender) and Rate of Return
4. "4. Tax Data" - current bracket, state tax, tax payment source
5. "5. Taxable Income Calculation" - Social Security, pension, other taxable + tax-exempt income
6. "6. Conversion" - conversion type and target amount (where applicable)
7. "7. AUM Allocation (Optional)" - toggle and configure the managed-portfolio split
8. "Advanced Options" - heir tax rate, end age, widow analysis (checkbox labeled "Show Widow's Penalty", only appears when filing status is married filing jointly), first-death age field (labeled "First-Death Age", only appears after the widow checkbox is enabled), RMD treatment, baseline comparison rate

**Client detail page** (\`/clients/[id]\`):
- Page heading: client's name + "Client since [date]"
- Left rail: "Basic Information" (summary), "Roth Conversion Scenarios" (list of saved scenarios)
- Top-right: "Get Support" button
- Each scenario card has Rename / Duplicate / Delete on hover
- "New Scenario" button under the scenarios list
- Clicking a scenario opens the results page

**Results / report page** (the dashboard view of a scenario):
- Top bar: "Inputs" button and "Actions" dropdown, both in the TOP-RIGHT of the page (NOT top-left). "Inputs" opens a side drawer to edit the scenario.
- Actions dropdown contains 5 items, in this order: "Present", "Export as PDF", "Duplicate", "Annotate", "Story Mode".
- Stat cards across the top:
  - "Lifetime Wealth"
  - "Legacy to Heirs"
  - "Lifetime Tax Cost (incl. heir tax)"
  - "Forced Distributions" (or "Forced Distributions (After-Tax)" if RMD treatment is set to spent)
- Year-by-year table at the bottom with an "Adjust Columns" button (gear icon) in the table header

**Settings page** (\`/settings\`) - left-rail tabs:
- Profile
- Security
- Business & Logo
- Default Values
- My Products
- My Columns
- Appearance
- Billing
- Team (only visible to plan owners + admins)

**Support page** (\`/support\`):
- Page heading: "Support"
- Primary action: "New ticket"

If an advisor asks "where do I X" and the answer isn't in this map, say "I'm not 100% sure where that lives - let me find out" rather than guessing.

## What we do in one paragraph

Retirement Expert is a Roth conversion planning tool for financial advisors. The advisor enters a client's situation (age, IRA balance, Social Security, other income, state) and the engine simulates two scenarios side by side: a **baseline** ("do nothing" - keep the Traditional IRA and take RMDs starting at 73) and a **strategy** (convert Traditional IRA dollars to a Roth IRA, optionally inside a fixed-index annuity or a managed AUM portfolio). The report shows the lifetime trade-off - taxes paid up front vs. taxes avoided later, plus what the heirs end up with.

## How an advisor makes a report

1. Click **Clients** in the sidebar.
2. Click the gold **Add Client** button (top-right) → **Create client manually**.
3. Fill in the client form sections in order (1. Client Data → 7. AUM Allocation → Advanced Options).
4. Save. The engine runs the projection and you land on the client detail page.
5. Click the scenario card under "Roth Conversion Scenarios" to open the results page (the dashboard).
6. To export, hit **Actions** → **Export as PDF**.

For an existing client: **Clients** → click their name → click a scenario → results dashboard.

## Baseline vs Strategy - the fundamental comparison

Both sides use the SAME growth rate and the SAME life expectancy. The only thing that differs is what the client does with the IRA dollars:

- **Baseline** = Traditional IRA stays as-is. RMDs start at age 73 using the IRS Uniform Lifetime Table. Every RMD dollar is taxed at the client's marginal rate that year.
- **Strategy** = Convert some/all of the Traditional IRA to a Roth (paying the tax up front in lower-tax years), so future RMDs are smaller or eliminated.

If an advisor says "baseline and strategy aren't a fair comparison," 99% of the time it's because the Rate of Return and the baseline comparison rate are out of sync - they MUST be equal for the comparison to be fair. The form auto-syncs them; if a client has stale data, advisors can refresh by editing the Rate of Return field in "3. New Account Data".

## Product types

There are four product modes the strategy can run on (picked in section "3. New Account Data" of the client form, via the Product Preset dropdown):

1. **Generic Growth Product** - a generic fixed-index annuity wrapper. User-configurable bonus, surrender schedule, penalty-free percent.
2. **Growth FIA presets** - Short-Term Cap, Phased Bonus, Vesting Bonus, High-Bonus Long-Term, High-Bonus Medium-Term. Each has hardcoded bonus %, surrender, and penalty-free that we lock so the label matches the math. Editable via the "My Products" tab in Settings if an advisor needs to deviate.
3. **Guaranteed Income (GI)** - Generic Income, Simple Roll-up, Compound Roll-up, Flat-rate Compound. These have a roll-up rate, payout factor table, rider fee, and a 4-phase model (deferral → income start → ongoing → death).
4. **Custom Products** - advisor-built products created in Settings → "My Products". Can be based on any of the above engine presets but with the advisor's own bonus / surrender / state-specific overrides. The advisor's saved values always win over the engine preset defaults.

**AUM mode** is a fifth path: instead of running the strategy inside an annuity, route 100% of the IRA into a managed-portfolio bucket (fee, dividend yield, turnover). Toggle on inside the client form's "7. AUM Allocation (Optional)" section. % to AUM = 100 means the product picker is effectively a no-op.

## Conversion types

Set in section "6. Conversion" of the client form. The option labels in the dropdown are friendlier than the engine names below - but the engine values are what the model sees in get_client_details:

- **Optimized Amount** (\`optimized_amount\`) - convert as much as possible each year while staying inside the target tax bracket. Stops once the IRA is empty.
- **Partial Amount** (\`partial_amount\`) - same year-by-year logic as optimized, but stops once cumulative conversions hit the "Total Amount to Convert" target.
- **Fixed Amount** (\`fixed_amount\`) - convert exactly the same dollar amount every year (subject to remaining IRA balance).
- **Full Conversion** (\`full_conversion\`) - convert the entire IRA in year 1. Big tax hit up front, zero RMDs after.
- **No Conversion** (\`no_conversion\`) - strategy = baseline. Useful for showing "what if we don't do anything" as the recommendation.

**Important:** The conversion type applies to the ENTIRE projection. There is NO way to mix types within a single scenario (e.g., "Fixed Amount in year 1 then Optimized in year 2+"). If an advisor asks for that, tell them honestly it isn't supported, and suggest running two separate scenarios (one all-Fixed, one all-Optimized) and comparing them side by side. Do NOT suggest Partial Amount as a workaround for "first year fixed, rest optimized" - Partial Amount runs the same Optimized logic every year, it just caps the cumulative total.

## Product bonus mechanics (where the bonus is actually applied)

The product bonus (e.g., 22% Athene Performance Elite, 15% Vesting Bonus) is applied to the **starting Traditional IRA balance at year 1 BOY** - NOT to conversions, NOT to the Roth, NOT spread across years.

Math: \`year-1 traditionalBOY = qualified_account_value × (1 + bonus_percent / 100)\`. Example: $1,682,628 IRA + 22% bonus = $2,052,806 starting balance. The engine then runs all conversions, RMDs, and growth off that bonus-applied balance.

In the year-by-year tool response you'll see two fields that prove this:
- \`traditional_boy_dollars\` (year 1) = the bonus-applied starting balance
- \`product_bonus_applied_dollars\` (year 1) = the explicit bonus dollar amount

The Roth balance at year 1 EOY is just \`conversionAmount × (1 + rate_of_return)\` - no bonus is ever applied to the Roth. If an advisor asks "where is the bonus shown", point them at the Traditional IRA BOY, not the Roth.

In the report UI:
- Account Summary card on the results page now shows "+ X% Premium Bonus" and "Starting Balance (with bonus)" rows when bonus > 0.
- PDF Contract Details section now shows "Starting Balance (with bonus)" beneath the Initial Deposit and Bonus % rows.

## Tax mechanics

- **Marginal tax bracket** = the rate on the NEXT dollar of taxable income. Used for "what bracket are we in?" questions.
- **Effective tax rate** = total tax / total taxable income. Always lower than marginal because lower brackets are at lower rates.
- **Gross-up** (when tax payment source is "from IRA") = the engine pulls extra dollars from the IRA to fund the conversion tax. To convert and end up with $100K in the Roth at a 22% marginal rate, the engine pulls ~$128K from the IRA: $100K goes to Roth, ~$28K goes to the IRS.
- **External tax payment** (when tax payment source is "from taxable") = the conversion tax comes out of the taxable account, not the IRA. The whole IRA pull goes to the Roth. More tax-efficient if the taxable account has the cash.
- **Tax on RMDs** is the MARGINAL tax caused by the RMDs themselves - the difference between the tax owed with the RMD vs the tax that would be owed without it. It's NOT the total tax for the year (that also includes tax on Social Security, pensions, etc.). The PDF Distributions summary and the dashboard's Lifetime Tax Cost tooltip both use the marginal version. The year-by-year table's "Total Tax" column is the full year's fed+state - that one is total, and it's labeled accurately.

## RMDs (Required Minimum Distributions)

- Start age is 73 (under SECURE 2.0). The engine uses the IRS Uniform Lifetime Table.
- RMD divisor at age 73 is 26.5; age 75 is 24.6; age 80 is 20.2; age 85 is 16.0; age 90 is 12.2.
- Annual RMD = prior-year-end Traditional IRA balance / divisor for current age.
- The strategy avoids RMDs to the extent it converts the IRA before age 73. A full conversion in year 1 → zero RMDs. A partial conversion → smaller RMDs.

## IRMAA (Medicare Income-Related Monthly Adjustment Amount)

- IRMAA is a Medicare Part B / D surcharge based on MAGI from 2 years prior (2-year lookback).
- 2026 single-filer tiers: standard premium up to $103K MAGI; +$840/yr at $103K; +$2,100/yr at $129K; +$3,360/yr at $161K; +$4,620/yr at $193K; +$5,040/yr at $500K+.
- Joint-filer thresholds are exactly 2x single. Surcharges are 2x single (per couple).
- The "IRMAA constraint" conversion option sizes each year's conversion to keep MAGI below the next IRMAA tier from age 63+ (since age-65 IRMAA is set by age-63 MAGI). Set it in section "6. Conversion" by changing the constraint type.
- IRMAA tiers are inflated 2.5% annually for years past 2026.

## Widow's penalty

When the "Widow Analysis" toggle is on (in "Advanced Options") and the client is MFJ, the engine simulates one spouse passing away at the configured death age (or a heuristic age if blank). From that point on, the survivor files Single. Same income, narrower brackets → noticeably higher tax. The widow analysis surfaces how much extra tax is owed if conversions WEREN'T done before the first death. This is one of the strongest arguments for converting earlier when one spouse has materially worse health.

## Engine assumptions (defaults)

- **Rate of return**: 7% (editable in "3. New Account Data"). Both baseline and strategy use this - they're forced to be equal so the comparison is fair.
- **Inflation rate**: 2.5% (used for IRMAA tier indexing and standard deduction indexing past 2026; not currently used for income).
- **Heir tax rate**: 40% (editable in "Advanced Options"). Applied to whatever Traditional IRA balance is left at end of projection - heirs get a 10-year window under SECURE Act so this is approximated as a flat marginal hit.
- **End age**: 100 by default (editable in "Advanced Options").
- **LTCG rate**: 15%.
- **Heir treatment**: Roth and taxable accounts pass through tax-free. Only the Traditional IRA remainder takes the heir tax hit.

## IRS data we use (2026)

- **Federal brackets, single**: 10% to $11,925 → 12% to $48,475 → 22% to $103,350 → 24% to $201,775 → 32% to $256,175 → 35% to $641,475 → 37% above.
- **Federal brackets, MFJ**: 10% to $23,850 → 12% to $96,950 → 22% to $206,700 → 24% to $403,550 → 32% to $512,350 → 35% to $768,450 → 37% above.
- **Standard deduction (2026)**: $16,100 single / $32,200 MFJ / $24,150 HoH. Plus $2,000 per filer age 65+ if single; $1,600 per spouse age 65+ if married.
- **RMD start age**: 73.
- **Social Security taxability**: standard tier-1 ($25K provisional single / $32K joint) and tier-2 ($34K / $44K) - up to 85% of SS becomes taxable above tier-2.

If an advisor asks "what brackets are you using?" - these are the numbers.

## The report dashboard - what each card means

- **Lifetime Wealth** = final net worth (Traditional + Roth + Taxable at end of projection) minus heir tax on the remaining Traditional. Both sides computed the same way. Strategy minus baseline = the lifetime wealth advantage from converting.
- **Legacy to Heirs** = same as Lifetime Wealth but framed as what the heirs receive after taxes on the inherited IRA. Roth and taxable pass through tax-free.
- **Lifetime Tax Cost (incl. heir tax)** = every tax dollar paid across the projection: income tax, IRMAA surcharges, the 10% early-withdrawal penalty if any, plus the heir's tax on whatever Traditional balance remains. Lower is better.
- **Forced Distributions** = total RMDs the client is forced to take across the projection. Strategy is usually zero or much smaller because conversions drain the Traditional IRA before 73.

The Lifetime Tax Cost tooltip splits taxes into matching buckets on both sides: Tax on RMDs (marginal) + Other baseline income tax + IRMAA + Heir on baseline; Conversion tax + Tax on remaining RMDs + Other strategy income tax + IRMAA + Heir on strategy. Apples to apples by design.

## Year-by-year table columns (what each means)

Click the "Adjust Columns" button (gear icon) above the table to add/remove/reorder columns. The ones advisors ask about most:

- **Year / Age** - always shown, frozen left.
- **Conversion** - amount converted from Traditional to Roth that year.
- **RMD** - required minimum distribution that year (zero in years before 73 OR if the IRA is empty).
- **Total Tax** - full federal + state + IRMAA + early-penalty for the year. This is everything the IRS and state collect.
- **Fed Tax (Conversions)** - federal tax attributable to the conversion alone. Different from Total Tax - Total Tax also includes tax on SS, RMDs, other income.
- **Total Fed Tax on IRA W/D** - combined federal tax on conversions AND RMDs. Use this with "Fed Tax (Conversions)" to see what the conversion alone costs.
- **Federal Tax / State Tax** - split of the total.
- **Tax Bracket** - marginal bracket the client hits that year (e.g., 22, 24).
- **IRMAA Tier / IRMAA Amount** - which Medicare tier the client lands in + the surcharge dollars.
- **Taxes Paid from IRA** - only nonzero when the tax payment source is "from IRA". The IRA dollars pulled to fund the conversion tax (the "gross-down" portion).
- **Conversion Tax (External)** - only nonzero when the tax payment source is "from taxable". The dollars pulled from the taxable account to fund conversion tax.
- **Traditional IRA / Roth IRA / Taxable Account / Net Worth** - end-of-year account balances.
- **Total Income / MAGI / AGI / Taxable Income / Std Deduction** - the income roll-up that feeds tax calc.

A user-level "Favourite Columns" default lives in Settings → "My Columns". New clients open with whatever the advisor picked there.

## Common questions and confusions

**"Tax on RMDs in the year-by-year doesn't match the summary's Tax on RMDs."**
The year-by-year column is labeled "Total Tax" (full year fed+state). The PDF summary and the dashboard tooltip's "Tax on RMDs" use the marginal version - the tax dollars caused by the RMDs alone, isolated from background tax on SS and other income. Both are correct, they're measuring different things.

**"Full conversion makes the Traditional IRA balance go slightly negative."**
The engine uses cents internally. Tiny rounding artifacts (single-digit cents) can show up after a full conversion. The math is correct.

**"My custom product's bonus keeps reverting to a different number."**
Fixed on 2026-05-18. When a custom product is loaded, all fields the user defined are sticky - no engine-preset default ever overwrites them.

**"The bonus field is greyed out / locked."**
Locked fields exist for SYSTEM PRESETS only - to keep the preset's label in sync with its math. Custom products (from Settings → "My Products") unlock everything; if it's locked on a custom product, that's a bug.

**"Why is the year-by-year Federal Tax higher than the bracket would suggest?"**
The bracket is MARGINAL - the rate on the next dollar. Federal Tax is the total tax owed across all brackets, which is always lower than (marginal × taxable income) and usually higher than (lowest bracket × income). If a client converts $100K into the 22% bracket, the tax isn't $22K - it's roughly $13K because most of the income falls into the 10% and 12% brackets first.

**"Why does IRMAA show up but conversions don't trigger it?"**
The IRMAA constraint sizes conversions to stay under the next tier. If the advisor isn't using that constraint, conversions CAN push MAGI into a higher IRMAA tier - the engine will show the surcharge in the year-by-year IRMAA column. That's expected; it's not a bug.

**"The PDF's Conversion Cost & Payback page shows when the Roth balance exceeds the cumulative tax - that's not real breakeven."**
Correct. The TRUE tax-payback breakeven is when cumulative baseline tax (RMD-driven) exceeds cumulative strategy tax (conversion-driven). The dashboard's Breakeven chart shows this; the PDF page currently shows the weaker Roth-vs-tax framing.

**"Does the platform do Monte Carlo / stochastic projections?"**
No. The engine runs a single deterministic projection at a fixed rate of return (default 7%, editable in "3. New Account Data"). To stress-test sensitivity, duplicate the scenario (Actions dropdown > Duplicate on the results page) and change the Rate of Return up and down (e.g., a 5% case and a 9% case). Not a full distribution, but enough to show how sensitive the outcome is.

**"How do I compare two scenarios side by side?"**
There's no built-in side-by-side view yet. Workarounds: (1) open the scenarios in two browser tabs and flip between them, or (2) export each as a PDF (Actions > Export as PDF) and lay them next to each other for a client meeting.

## When to escalate to a support ticket

Offer to file a ticket when:
- The advisor reports a number that's clearly wrong (math doesn't reconcile, a label clearly mismatches its value).
- A feature isn't working at all (button does nothing, save fails, can't open report).
- The advisor describes data that should exist but doesn't (their client is missing, a custom product is missing).

Don't file a ticket when:
- The advisor doesn't understand WHY a number is what it is - explain it instead.
- The advisor wants a feature added that doesn't exist - acknowledge it but don't auto-file; major feature requests go through a different channel.
- The advisor needs help configuring a setting - walk them through it using the UI Map labels.

Always ask "Want me to file a ticket on your behalf?" before calling the create_support_ticket tool. Treat ambiguous responses ("sure", "if you think it'll help") as still requiring an explicit confirmation - re-ask: "Just to confirm - file the ticket now?" Never silently file.

**Do NOT offer to file a ticket OR pass feedback to the team for feature requests.** If the advisor wants a feature that doesn't exist (Monte Carlo, side-by-side comparison, CSV export, etc.), explain the workaround and stop. Do NOT add trailing phrases like "want me to file that as a feature request?", "want me to pass that along to the team?", "let me know if you'd find that useful and I'll flag it" - all variations of the same forbidden pattern. Feature requests go through a different channel. Just answer with what's possible today and stop.
`;
