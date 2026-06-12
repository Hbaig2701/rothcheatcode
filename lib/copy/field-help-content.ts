/**
 * Plain-language explanations for every input field in the manual client
 * form and the intake questionnaire. Each entry has a short title, a
 * 1–3 sentence body, and an example.
 *
 * Audience: financial advisors who are NOT software engineers and may not
 * be deeply versed in every annuity/conversion nuance. Aim for the level
 * of a sharp generalist advisor reading this for the first time.
 *
 * Editing notes:
 *   - Be accurate first. Don't oversimplify a concept into something wrong.
 *   - Lead with what the field is and what it controls in the model.
 *   - Add an "Example" with concrete numbers — that's what advisors remember.
 *   - Avoid jargon-as-jargon. If you must use a term (RMD, IRMAA), gloss it.
 *
 * Keys here are referenced from the form section components, NOT bound by
 * filename — keep names stable so the audit agent can cross-check.
 */

export interface FieldHelpEntry {
  title: string;
  body: string;
  example: string;
}

export const FIELD_HELP = {
  // ============================================================
  // SECTION 1: CLIENT DATA
  // ============================================================
  scenario_name: {
    title: "Scenario Name",
    body: "Optional label for this projection. Useful when you're modeling multiple strategies for the same client (e.g., 'Aggressive 5-year' vs 'Conservative 10-year') so you can tell them apart in the client list.",
    example: "Aggressive 5-Year Conversion · Bracket-Filled to 32%",
  },
  filing_status: {
    title: "Filing Status",
    body: "How the client files their federal taxes. Drives the tax brackets and standard deduction used in every projection year. Choose 'Married Filing Jointly' for married couples filing together — this gives the wider brackets that allow larger Roth conversions at the same rate.",
    example: "A retired couple filing one return together → Married Filing Jointly. A widow filing on her own → Single.",
  },
  name: {
    title: "Client Name",
    body: "The client's full name. This is how they'll appear in your client list and on any reports or PDFs you generate.",
    example: "John Smith",
  },
  age: {
    title: "Client Age",
    body: "The client's current age in years. The projection uses this as Year 0 and rolls forward from here. Critical for RMD timing (age 73), Social Security start ages, and the 10% early-withdrawal penalty (under 59½).",
    example: "If the client just turned 67, enter 67. If they're 67 but turn 68 in a few months, still enter 67 — the projection rounds based on age at the start of the projection year.",
  },
  spouse_name: {
    title: "Spouse Name",
    body: "The spouse's full name. Used in story-mode narratives and any spousal-specific report sections.",
    example: "Kristi Smith",
  },
  spouse_age: {
    title: "Spouse Age",
    body: "The spouse's current age. Drives spousal RMD timing, spousal Social Security start, and the Widow's Penalty analysis (which prices brackets at single-filer rates after the older spouse passes).",
    example: "Husband is 75, wife is 73. Enter 73 for spouse age.",
  },

  // ============================================================
  // SECTION 2: CURRENT ACCOUNT DATA
  // ============================================================
  qualified_account_value: {
    title: "Qualified Account Value",
    body: "Total balance the client wants modeled in the strategy — this is the bucket the Roth conversion or annuity strategy runs on. Combine Traditional IRA, 401(k), 403(b), and any other pre-tax retirement accounts they're rolling into the new product.",
    example: "Client has $850K in a Traditional IRA and $400K in an old 401(k) they're consolidating. Enter $1,250,000.",
  },
  roth_ira: {
    title: "Roth IRA Balance",
    body: "The client's existing Roth IRA balance — money that's already been taxed and grows tax-free. The engine starts converted dollars into this same Roth bucket so they keep compounding.",
    example: "Client opened a backdoor Roth in 2019 and now has $85,000. Enter $85,000. If they have no Roth, leave at $0.",
  },
  taxable_accounts: {
    title: "Taxable Account Balance",
    body: "Non-retirement brokerage and savings — money that's already been taxed and pays tax on dividends/gains each year. Important if the client is paying conversion taxes 'from outside' (taxable), because the engine draws from this bucket.",
    example: "Joint brokerage account with Fidelity holding $200,000 in index funds. Enter $200,000.",
  },
  other_retirement: {
    title: "Other Retirement",
    body: "Pre-tax retirement balances NOT being rolled into the strategy product — e.g., a 401(k) still at a former employer, a TSP, or a 403(b) they're keeping in place. Tracked separately so legacy and net-worth views are complete.",
    example: "Client has $1.2M in the IRA being annuitized, plus $300K still sitting in a Vanguard 401(k) they're not touching. Enter $300,000 here.",
  },

  // ============================================================
  // SECTION 3: NEW ACCOUNT (Insurance Product)
  // ============================================================
  blueprint_type: {
    title: "Product Preset",
    body: "The annuity product the strategy uses. 'Growth' products focus on accumulation and Roth conversions; 'Guaranteed Income' products provide income payments. Pick a system preset, one of your own custom products, or a starred favorite for a one-click selection.",
    example: "Selling a Nationwide Peak 10 FIA → pick a Growth preset that matches its bonus and surrender schedule. Selling an Athene Ascent Pro 10 → pick the corresponding Guaranteed Income preset.",
  },
  carrier_name: {
    title: "Carrier Name",
    body: "The insurance company issuing the annuity (Allianz, Athene, Nationwide, etc.). Locked when a system preset is selected — pick a different preset or use a custom product if you need to override it.",
    example: "Athene Annuity and Life Company",
  },
  product_name: {
    title: "Product Name",
    body: "The specific product the client is buying (e.g., 'Ascent Pro 10 Bonus'). Locked when a system preset is selected. Appears on the PDF report so the client knows exactly which product was illustrated.",
    example: "Ascent Pro 10 Bonus",
  },
  bonus_percent: {
    title: "Premium Bonus %",
    body: "The upfront bonus the carrier credits to the account value on day one as a percentage of premium. Locked when a system preset is selected because each product ships with its known bonus. If you have state-specific overrides, set them up in a Custom Product so they apply automatically.",
    example: "Client deposits $500,000 into a product with a 19% bonus → account value starts at $595,000.",
  },
  rate_of_return: {
    title: "Rate of Return %",
    body: "The assumed annual return the account earns each year. Used for BOTH the strategy projection and the 'do nothing' baseline so the comparison stays apples-to-apples. Default 7% is a common assumption — check your carrier's illustration software for what's appropriate.",
    example: "Carrier illustration shows a 6.5% historical average → enter 6.5%. Reviewing for prudent assumptions → enter 5–6%.",
  },
  roll_up_option: {
    title: "Roll-Up Option",
    body: "How the Income Base grows each year during deferral on Guaranteed Income products. 'Simple' grows by a flat % of the original premium each year. 'Compound' grows by a % of the current (already-grown) Income Base — more growth long-term but a lower starting credit.",
    example: "10% simple on a $500K premium grows by $50K/yr no matter what. 10% compound grows by $50K in year 1, $55K in year 2, and so on.",
  },
  payout_option: {
    title: "Payout Option",
    body: "How the Lifetime Payment Amount (LPA) is structured once income begins. Level pays a higher starting income that stays flat for life. Increasing starts lower but rises each year — better long-term inflation protection, worse early.",
    example: "Client age 80, modest life expectancy → Level (more income up front). Client age 65 with long life expectancy and inflation worry → Increasing.",
  },
  payout_type: {
    title: "Payout Type",
    body: "Whether the guaranteed income is structured on one life or two. 'Individual' pays for the client's life. 'Joint' pays until the second spouse dies — usually 10–15% lower starting income but continues if the client passes first.",
    example: "Single client → Individual. Married couple, the spouse will need this income if the client dies first → Joint.",
  },
  income_start_age: {
    title: "Income Start Age",
    body: "Age the client begins receiving guaranteed income payments. The years between today and this age are the 'deferral' or 'roll-up' window where the Income Base grows. Many products require minimum 1-year deferral and have payout factors that increase the longer you wait.",
    example: "Client is 65 today and wants income starting at 70 → enter 70. That's 5 years of roll-up.",
  },
  gi_conversion_years: {
    title: "Years to Convert Before GI Purchase",
    body: "On a Guaranteed Income strategy you can convert some of the Traditional IRA to Roth BEFORE buying the annuity. This sets the conversion window in years. IMPORTANT: the engine spreads the conversion EVENLY across the window (starting IRA ÷ years) — it doesn't bracket-fill year by year. Whatever's left at the end of the window funds the annuity.",
    example: "Client has $900K IRA and wants 3 years of conversions → $300K converted each year, then the residual buys the annuity. Larger window = smaller annual conversion = lower marginal tax hit.",
  },
  gi_conversion_bracket: {
    title: "Conversion Tax Bracket",
    body: "The FLAT federal rate the engine applies to each year's GI conversion. Unlike the Growth FIA strategy, GI conversions are pre-sized to evenly distribute the IRA across the conversion window — this field doesn't change how MUCH is converted, only the tax rate assumed on the converted dollars. Pick whichever bracket you expect the client to land in across the conversion years.",
    example: "Client converts ~$300K/yr on top of $80K other income → likely lands in the 24% MFJ bracket → pick 24%. To bracket-shop, increase the years-to-convert field instead.",
  },

  // ============================================================
  // SECTION 4: TAX DATA
  // ============================================================
  constraint_type: {
    title: "Additional Constraint",
    body: "Bracket Ceiling — via the Max Tax Rate field below — is ALWAYS the primary cap on each year's conversion. This dropdown decides whether to layer an additional IRMAA cap on top. 'Bracket Ceiling only' = fill to Max Tax Rate every year, ignore IRMAA. 'Bracket Ceiling + IRMAA Tier cap' = same as before, but also stay under the IRMAA tier you pick. The tighter of the two caps wins each year.",
    example: "Most clients on Medicare → Bracket Ceiling + IRMAA Tier cap. Pre-Medicare clients (under 63) → Bracket Ceiling only (IRMAA hasn't kicked in yet).",
  },
  target_irmaa_tier: {
    title: "Target IRMAA Tier",
    body: "Which IRMAA premium tier you want the client's MAGI to stay under each year. Standard = no surcharge at all (most conservative). Each higher tier allows larger conversions but adds Medicare Part B + D premium surcharges. Tier 5 means no IRMAA cap — convert as aggressively as the bracket ceiling allows. Only applied at age 63+ (IRMAA uses a 2-year lookback for age-65 Medicare eligibility).",
    example: "Client wants zero Medicare premium hit → Standard. Client is willing to pay ~$2,100/yr in surcharges to convert faster → Tier 2. Client wants the biggest conversions possible and accepts whatever IRMAA hits → Tier 5.",
  },
  // tax_rate ("Current Bracket") was retired from the form on 2026-06-05.
  // It was originally used by the GI engine as a flat baseline tax rate, but
  // the engine has since been migrated to bracket-aware math (federal + state
  // + IRMAA per year) so the field is no longer load-bearing for any product.
  // The schema column remains for backward compatibility with historical
  // projections; nothing in the form reads or writes it anymore.

  max_tax_rate: {
    title: "Max Tax Rate",
    body: "The bracket ceiling the engine will fill conversions up to each year. The single most important field for sizing the strategy. Pick the highest bracket you're willing to convert into — the engine fills to the top of that bracket every year. '0%' means convert only up to the standard deduction (no federal tax).",
    example: "MFJ client wants to convert aggressively but stay under the IRMAA cliff → 24%. Client comfortable paying top rates to get it done fast → 32% or higher.",
  },
  tax_payment_source: {
    title: "Tax Payment Source",
    body: "Where the conversion tax dollars come from. 'External (from taxable)' is the better outcome — taxes paid from outside savings, so 100% of the converted amount lands in Roth. 'Internal (from IRA)' grosses up the conversion to cover taxes — easier for clients without outside cash but less efficient.",
    example: "Client has $300K in a joint brokerage they can tap → External. Client only has the IRA → Internal.",
  },
  respect_penalty_free_limit: {
    title: "Respect Carrier Penalty-Free Limit",
    body: "Many FIAs cap penalty-free withdrawals at ~10%/yr of prior anniversary value during the surrender period. Turn this ON to make the engine size conversions so the carrier cap isn't exceeded. Turn OFF if the client is willing to pay surrender charges or the contract isn't restrictive.",
    example: "Athene contract allows 10%/yr penalty-free → ON. Client doesn't care about surrender charges → OFF.",
  },
  penalty_free_scope: {
    title: "What Counts Toward the Cap",
    body: "Only matters when 'Respect Penalty-Free Limit' is ON. 'Only the tax payment' (default) treats the Roth conversion as an intra-carrier transfer and only counts the dollars pulled out to pay tax — so this scope effectively caps nothing if Tax Payment Source is 'External'. 'Every dollar that leaves the IRA' is stricter: conversion + RMD + tax all count toward the cap, even when tax is paid from outside cash. Use the strict mode when the carrier's contract treats the conversion itself as a withdrawal.",
    example: "Allianz intra-carrier Roth, paying tax from IRA → 'Only the tax payment'. Carrier where the conversion triggers a surrender charge → 'Every dollar that leaves the IRA'.",
  },
  rmd_treatment: {
    title: "RMD Treatment (Baseline)",
    body: "How Required Minimum Distributions are handled in the 'do nothing' baseline scenario for comparison. Spent = consumed for living expenses (gone). Reinvested = redeposited into a taxable brokerage where they keep growing. Cash = sits in a checking account earning nothing. Only affects the baseline; the strategy projection is unaffected.",
    example: "Most retirees use RMDs to live on → Spent. Wealthy client who doesn't need the income → Reinvested.",
  },
  rmds_handled_externally: {
    title: "RMDs Handled Externally",
    body: "Turn ON when you're modeling only PART of the client's total IRA in this software and RMDs are being taken from a separate bucket (e.g., a different custodian) that's not modeled here. The engine will skip RMD calculation entirely on this bucket for both the strategy AND the baseline — keeping the comparison fair. If you want the full tax picture, manually add the external RMD amount as an entry in Section 5 (Taxable Income).",
    example: "Client has $2.5M total IRA — $1.3M moves to an Athene FIA for Roth conversion, $1.2M stays at Fidelity as Traditional. You're modeling only the $1.3M bucket here and taking real-world RMDs from Fidelity. Toggle ON → engine won't eat into your $1.3M conversion target with phantom RMDs.",
  },
  state: {
    title: "State of Residence",
    body: "The state the client lives in for tax purposes. Drives the State Tax rate (auto-filled when you select a state) and triggers any state-specific product availability or bonus overrides.",
    example: "California resident → CA. Snowbird who claims Florida domicile → FL.",
  },
  state_tax_rate: {
    title: "State Tax Rate",
    body: "The state income tax rate applied to conversions and IRA distributions. Auto-loaded from a preset when you pick a state — click 'Manually Edit' to override (e.g., for clients in special tax situations like a CA AMT add-back).",
    example: "California → preset loads 9.3% (top marginal). Florida or Texas → preset loads 0% (no state income tax).",
  },

  // ============================================================
  // SECTION 5: TAXABLE INCOME (SSI + other)
  // ============================================================
  ssi_payout_age: {
    title: "Client SS Start Age",
    body: "The age the client started — or will start — collecting Social Security. Must be 62 or older. If they're ALREADY collecting, enter the age they actually claimed (which is below their current age) — NOT their current age. The engine treats SS as 'on' for any projection year at or past this age, so the income is identical either way, but entering their current age makes the report announce 'Social Security Begins' this year, which is wrong for someone who's been collecting for years.",
    example: "Client claimed at 66, is now 72 → enter 66 (not 72). Client plans to delay to 70 → enter 70.",
  },
  ssi_annual_amount: {
    title: "Client SS Annual Amount",
    body: "Annual Social Security benefit in today's dollars (the gross before any Medicare premium deductions). The engine includes this in taxable income from the start age onward, applies provisional-income rules, and uses it for IRMAA tier checks.",
    example: "Client gets $2,800/month from SS → enter $33,600 ($2,800 × 12). Get this number from the client's SSA statement.",
  },
  spouse_ssi_payout_age: {
    title: "Spouse SS Start Age",
    body: "The age the spouse started — or will start — collecting Social Security. Same rule as the client: if they're already collecting, enter the age they actually claimed (below their current age), NOT their current age. Must be 62 or older. Leave the default (67) if the spouse hasn't decided yet; you can revise.",
    example: "Spouse plans to claim at full retirement age 67 → enter 67. Spouse already started at 62 → enter 62.",
  },
  spouse_ssi_annual_amount: {
    title: "Spouse SS Annual Amount",
    body: "Annual SS benefit for the spouse in today's dollars. Combined with the client's SS for provisional income and IRMAA calculations once both are collecting.",
    example: "Spouse gets $1,650/month → enter $19,800.",
  },
  non_ssi_income_table: {
    title: "Other Taxable Income Schedule",
    body: "Year-by-year non-Social-Security income — pensions, rental income, RMDs from a non-modeled IRA, part-time wages, etc. Use 'Repeat' to fill a recurring amount across an age range. Only enter income that hasn't already been captured elsewhere in the form.",
    example: "Client has a $24,000/yr pension starting at age 65 for life → add one row, enter 65 in 'Start Age', a generous end age (e.g., 95), $24,000 amount, type 'Pension', click Repeat.",
  },

  // ============================================================
  // SECTION 6: CONVERSION
  // ============================================================
  conversion_type: {
    title: "Conversion Type",
    body: "The strategy the engine uses to size annual Roth conversions. Optimized = fill the Max Tax Rate bracket each year (most common). Partial = same as Optimized but stop once cumulative conversions hit a target dollar amount. Fixed = convert the same dollar amount yearly. Full = convert everything in year 1. No Conversion = baseline only.",
    example: "Client says 'convert as much as you can without going past 24%' → Optimized. Client says 'I'm willing to convert $1.2M total, no more' → Partial.",
  },
  fixed_conversion_amount: {
    title: "Annual Conversion Amount",
    body: "Only used with 'Fixed Amount' conversion type. The dollar amount converted every year regardless of tax bracket — the engine pushes through even if it spills into a higher bracket. Stops when the IRA is empty.",
    example: "Client wants exactly $80,000/yr converted → enter $80,000.",
  },
  target_partial_amount: {
    title: "Total Amount to Convert",
    body: "Only used with 'Partial Amount' conversion type. The cumulative dollar amount the engine should convert across all years combined. It converts optimally each year (filling the bracket) and stops once total conversions reach this number. The unconverted remainder stays as Traditional IRA.",
    example: "Client has $3.1M IRA but only wants $2.2M converted → enter $2,200,000. The other $900K stays Traditional.",
  },
  protect_initial_premium: {
    title: "Protect Initial Premium",
    body: "Prevents the engine from withdrawing dollars that would reduce the account value below the original premium amount. Useful for products with principal-protection riders or when the client doesn't want their starting balance touched.",
    example: "Client deposits $500K with a 10% bonus (start = $550K). Toggle ON → engine never lets account value drop below $500K via withdrawal.",
  },

  // ============================================================
  // SECTION 7: AUM ALLOCATION
  // ============================================================
  aum_allocation_enabled: {
    title: "Send Part of IRA to AUM",
    body: "Models a split strategy: convert part of the IRA via Roth and route the remainder to a managed brokerage account you'll manage as AUM. The combined view shows the full picture across both buckets.",
    example: "Client has $1M IRA. You convert 50% via Roth on annuity, send the other 50% to a Schwab managed account you charge 1% on.",
  },
  aum_allocation_percent: {
    title: "% to AUM",
    body: "The percentage of the IRA that flows out to the managed brokerage. The Roth conversion strategy runs on the remainder (100% minus this number).",
    example: "Enter 40 → 40% of the IRA goes to AUM, the other 60% runs through Roth conversions.",
  },
  aum_withdrawal_years: {
    title: "Withdrawal Years",
    body: "How many years to spread the IRA-to-AUM transfer over. Bigger numbers smooth the tax bracket impact; smaller numbers move money faster but may push the client into higher brackets in the early years.",
    example: "Move $400K to AUM over 5 years → enter 5. Engine withdraws ~$80K/yr from the IRA to the brokerage.",
  },
  aum_fee_percent: {
    title: "AUM Fee (%/yr)",
    body: "The annual advisory fee you charge on the brokerage balance. Deducted yearly from the AUM bucket in the projection.",
    example: "Standard 1% AUM fee → enter 1. Tiered fee schedule averaging 0.85% → enter 0.85.",
  },
  aum_dividend_yield: {
    title: "Dividend Yield (%/yr)",
    body: "Annual dividend yield on the AUM portfolio. Taxed yearly at the LTCG rate below — creates a small drag on after-tax returns.",
    example: "Broad-market index fund yielding ~1.8% → enter 1.8.",
  },
  aum_turnover_percent: {
    title: "Annual Turnover (%)",
    body: "Share of unrealized capital gains realized each year due to portfolio rebalancing. Realized gains pay LTCG tax annually — higher turnover = more tax drag.",
    example: "Low-turnover index portfolio → 5–10%. Actively managed fund → 30–50%.",
  },
  ltcg_rate: {
    title: "LTCG Rate (%)",
    body: "Long-term capital gains rate applied to dividends + realized turnover. Federal LTCG is 0/15/20% depending on income; add state if your state taxes LTCG as ordinary income.",
    example: "MFJ client in 22% bracket, no state LTCG → 15%. California client in top bracket → 15% federal + 13.3% state ≈ 28.3%.",
  },

  // ============================================================
  // SECTION 8: WITHDRAWALS
  // ============================================================
  withdrawals_table: {
    title: "IRA / Roth Withdrawals",
    body: "Voluntary distributions the client wants to take each year. Enter the TOTAL amount the client wants pulled — for IRA withdrawals, this satisfies the RMD up to its amount (matches IRS rules: a voluntary distribution counts toward that year's RMD; no extra RMD is forced on top). Only the shortfall (if voluntary < RMD) is added as a forced RMD. Source 'IRA' adds to taxable income (10% penalty if under 59½), 'Roth' is tax-free, 'Auto' lets the baseline draw from IRA while the strategy draws from Roth.",
    example: "Client age 75 wants $60K/yr from the IRA, RMD is $40K → enter $60,000 Source IRA. The engine pulls $60K total ($40K satisfies the RMD, $20K is extra), not $100K.",
  },

  // ============================================================
  // SECTION 9: ADVANCED DATA
  // ============================================================
  surrender_years: {
    title: "Surrender Years",
    body: "Number of years the annuity carries surrender charges (the period during which early withdrawals incur a penalty). Locked when a system preset is selected — click 'Override preset' if a state-specific version of the same product has a different schedule.",
    example: "Athene Ascent Pro 10 has a 10-year surrender period → 10. Most growth FIAs are in the 7–10 range.",
  },
  penalty_free_percent: {
    title: "Penalty Free %",
    body: "The percentage of the prior anniversary value the client can withdraw each year during the surrender period without a surrender charge. Typically 10%. Combined with the 'Respect Penalty-Free Limit' toggle in Section 4 to constrain conversions.",
    example: "10%/yr is the most common cap. Athene Base has a 5% cap. AmEquity Bonus IncomeShield has 10%.",
  },
  baseline_comparison_rate: {
    title: "Baseline Comparison Rate",
    body: "Annual return rate used for the 'do nothing' baseline IRA projection. Auto-synced with the strategy's Rate of Return so the comparison stays fair — adjust only if you have a specific reason (e.g., comparing the strategy to a 60/40 portfolio at a different assumption). HEADS UP: any manual override here gets reset the moment you touch Rate of Return again, so set this LAST.",
    example: "Strategy at 7% → baseline auto-sets to 7%. To compare strategy vs a 5% conservative baseline, finalize Rate of Return first, then override this to 5.",
  },
  post_contract_rate: {
    title: "Post-Contract Rate",
    body: "Renewal rate applied to the annuity's account value AFTER the surrender period ends. Doesn't affect the baseline IRA. Defaults to the main Rate of Return — lower it if you expect renewal rates to drop.",
    example: "Strategy at 7% during surrender, expect 5% renewals afterward → enter 5.",
  },
  years_to_defer_conversion: {
    title: "Years to Defer Conversion",
    body: "Skip Roth conversions for this many years before starting. Useful if the client expects a large income event (sale of a business, severance) and wants to wait until they're in a lower bracket.",
    example: "Client is selling a business in 2 years and will be in a lower bracket starting year 3 → enter 2. Most clients → 0.",
  },
  end_age: {
    title: "End Age",
    body: "Final age the projection runs through. Sets the time horizon of all charts, tables, and the heir/legacy calculation. Default 95 is standard for life-expectancy-based planning.",
    example: "Standard projection → 95. Conservative long-horizon client with longevity in family → 100.",
  },
  heir_tax_rate: {
    title: "Heir Tax Rate",
    body: "Marginal federal rate you assume the heirs will pay on inherited Traditional IRA dollars. Applied at the END of the projection to net-down any pre-tax balance left in the baseline AND to any Traditional remainder still left in the strategy (common with Partial Amount conversions, where some Traditional intentionally stays unconverted). Roth inheritances are always tax-free, so this never touches the Roth bucket.",
    example: "Heirs are mid-career professionals likely in the 32–35% bracket → 32. Conservative assumption → 24.",
  },
  widow_analysis: {
    title: "Widow's Penalty Analysis",
    body: "Models the 'widow's penalty' — when one spouse dies, the survivor files single instead of MFJ. Single-filer brackets compress dramatically, so the survivor often pays much higher taxes on the same income. Only available for married couples.",
    example: "MFJ couple has $150K income at 22%. Husband dies. Wife files single on same $150K → jumps to 24%. Toggle ON to show this in the report.",
  },
  widow_death_age: {
    title: "First-Death Age",
    body: "The age of the OLDER spouse when first death occurs. Anchors the widow analysis to a specific year. Leave blank to use the default heuristic (85 = older spouse's life expectancy). The survivor's brackets re-price at single-filer rates from this year forward.",
    example: "Husband (the older spouse) is currently 75. Want to model death at 90 → enter 90. Leave blank → defaults to 85.",
  },

  // ============================================================
  // INTAKE-FORM-ONLY FIELDS (client-facing questionnaire)
  // ============================================================
  intake_name: {
    title: "Full Name",
    body: "Your full legal name as it would appear on your tax return.",
    example: "John Allen Smith",
  },
  intake_age: {
    title: "Age",
    body: "Your current age in years.",
    example: "If you're 67, enter 67. Round down if you're partway through a year.",
  },
  intake_filing_status: {
    title: "Filing Status",
    body: "How you file your federal taxes — Single or Married Filing Jointly. If you file Married Filing Separately, choose Married Filing Jointly here and mention it to your advisor — they'll adjust the bracket assumptions manually so the projection is accurate.",
    example: "Married couple filing one tax return together → Married Filing Jointly. Single, divorced, or widowed → Single.",
  },
  intake_spouse_name: {
    title: "Spouse Name",
    body: "Your spouse's full legal name.",
    example: "Mary Elizabeth Smith",
  },
  intake_spouse_age: {
    title: "Spouse Age",
    body: "Your spouse's current age in years.",
    example: "If your spouse is 65, enter 65.",
  },
  intake_state: {
    title: "State of Residence",
    body: "The U.S. state you live in for tax purposes. This determines your state income tax rate in the projection.",
    example: "If you live in California, choose California. Snowbird who claims Florida residency for tax purposes → Florida.",
  },
  intake_qualified_account_value: {
    title: "Qualified Account Value (IRA, 401k, etc.)",
    body: "Combined balance of your pre-tax retirement accounts — Traditional IRA, 401(k), 403(b), TSP. Don't include Roth balances here (those go below).",
    example: "Traditional IRA at Fidelity: $620,000. Old 401(k) at Vanguard: $180,000. Total entered: $800,000.",
  },
  intake_roth_ira: {
    title: "Roth IRA Balance",
    body: "The total balance in any Roth IRA accounts you have. Leave at 0 if you don't have one.",
    example: "Roth IRA at Schwab: $75,000. Enter $75,000.",
  },
  intake_taxable_accounts: {
    title: "Taxable Account Balance",
    body: "Non-retirement savings: brokerage accounts, savings accounts, CDs. Money that isn't in an IRA or 401(k). Leave at 0 if none.",
    example: "Joint brokerage at Fidelity: $250,000. High-yield savings: $50,000. Total: $300,000.",
  },
  intake_ssi_payout_age: {
    title: "Expected SS Start Age",
    body: "The age you plan to start collecting Social Security — or, if you've already started, the age you actually began (which is below your current age). Most people start between 62 and 70. If you're already collecting, enter the age you claimed, not your current age.",
    example: "You started collecting at age 66 → enter 66. You haven't started yet and plan to wait until 70 → enter 70. You've been collecting since 67 and are now 78 → enter 67.",
  },
  intake_ssi_annual_amount: {
    title: "Expected Annual SS Amount",
    body: "Your annual Social Security benefit in today's dollars — the gross amount BEFORE Medicare premiums are deducted. You can find your estimated benefit on your Social Security statement at ssa.gov.",
    example: "If your benefit is $2,400/month, enter $28,800 ($2,400 × 12).",
  },
  intake_spouse_ssi_payout_age: {
    title: "Spouse SS Start Age",
    body: "The age your spouse plans to start (or did start) collecting Social Security — if they're already collecting, the age they actually claimed, not their current age. Most people start between 62 and 70.",
    example: "Spouse plans to claim at full retirement age 67 → enter 67. Spouse has been collecting since 65 and is now 74 → enter 65.",
  },
  intake_spouse_ssi_annual_amount: {
    title: "Spouse Annual SS Amount",
    body: "Your spouse's annual Social Security benefit in today's dollars — gross, before Medicare deductions.",
    example: "Spouse's benefit is $1,500/month → enter $18,000.",
  },
  intake_income_entries: {
    title: "Other Income Sources",
    body: "Any non-Social-Security income you'll receive — pension, rental property, part-time work, dividends from non-retirement accounts. Add one row per source. For each, enter the annual amount and the age range over which you expect to receive it.",
    example: "Pension paying $30,000/yr starting at age 65 for life → Type: Pension, Amount: $30,000, Start Age: 65, End Age: 95 (or your expected lifespan).",
  },
} as const satisfies Record<string, FieldHelpEntry>;

export type FieldHelpKey = keyof typeof FIELD_HELP;
