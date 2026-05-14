/**
 * Glossary for the Roth Theory curriculum.
 *
 * Each entry is a term that appears in module copy and warrants an
 * inline tooltip definition. The `<Term name="...">label</Term>` wrapper
 * renders the label with a dotted underline; hover reveals the title
 * + body. Centralizing definitions means the same explanation surfaces
 * everywhere the term appears, and edits propagate.
 *
 * Add new entries when the modules introduce new jargon. Keep bodies
 * short (one or two sentences) - the tooltip is a hint, not a textbook.
 */

export interface GlossaryEntry {
  /** Bold heading shown at the top of the tooltip. */
  title: string;
  /** Body text - keep short. */
  body: string;
}

export const GLOSSARY = {
  'roth-conversion': {
    title: 'Roth conversion',
    body: 'Moving dollars from a Traditional IRA to a Roth IRA. The converted amount is taxed as ordinary income in the year of conversion; from then on the dollars (and their growth) are tax-free.',
  },
  'traditional-ira': {
    title: 'Traditional IRA',
    body: 'A pre-tax retirement account. Contributions and growth are tax-deferred; withdrawals (including Required Minimum Distributions) are taxed as ordinary income.',
  },
  'roth-ira': {
    title: 'Roth IRA',
    body: 'A post-tax retirement account. Contributions are made with after-tax dollars; growth and qualified withdrawals are tax-free, and the original owner has no Required Minimum Distributions.',
  },
  'rmd': {
    title: 'Required Minimum Distribution (RMD)',
    body: 'The IRS-mandated annual withdrawal from a Traditional IRA starting at age 73. Calculated each year as the prior year-end balance divided by an IRS distribution period that shrinks with age.',
  },
  'irmaa': {
    title: 'IRMAA (Income-Related Monthly Adjustment Amount)',
    body: 'A surcharge on Medicare Part B and Part D premiums for higher-income retirees. Tier-based on MAGI from two years prior; thresholds are cliffs (one dollar over triggers the full tier surcharge).',
  },
  'magi': {
    title: 'MAGI (Modified Adjusted Gross Income)',
    body: 'Adjusted Gross Income plus certain add-backs (most commonly tax-exempt interest). Used to determine IRMAA tiers, Roth contribution limits, and several other income-tested thresholds.',
  },
  'agi': {
    title: 'AGI (Adjusted Gross Income)',
    body: 'Total income minus specific above-the-line deductions. The starting point for federal taxable income before the standard deduction is applied.',
  },
  'mfj': {
    title: 'MFJ (Married Filing Jointly)',
    body: 'A tax filing status for married couples filing one return together. MFJ brackets are roughly twice the width of single brackets, so the same income generally hits lower rates.',
  },
  'fia': {
    title: 'FIA (Fixed Indexed Annuity)',
    body: 'An insurance product that credits interest tied to a market index with downside protection (principal is not exposed to market losses). Often paired with bonuses, surrender schedules, and optional income riders.',
  },
  'gi-product': {
    title: 'Guaranteed Income (GI) product',
    body: 'An annuity that pays a guaranteed income stream for life once activated. The income amount is typically based on a separate income base / roll-up balance, not the contract cash value.',
  },
  'standard-deduction': {
    title: 'Standard deduction',
    body: 'A flat dollar amount subtracted from gross income before federal tax brackets apply. About $15K for single filers and $30K for MFJ in 2026, with additional bonuses for filers age 65 and over.',
  },
  'marginal-rate': {
    title: 'Marginal tax rate',
    body: 'The federal tax rate on the next dollar of income. The rate of the highest bracket the income reaches; not the rate the entire income pays.',
  },
  'effective-rate': {
    title: 'Effective tax rate',
    body: 'Total federal tax owed divided by total taxable income. The average rate across all the brackets the income filled.',
  },
  'gross-up': {
    title: 'Gross-up',
    body: 'When conversion tax is paid from inside the IRA, the engine adds an extra IRA withdrawal to cover the tax. That extra withdrawal is itself taxable, requiring more withdrawal still. The iterative process of closing this loop is called the gross-up.',
  },
  'surrender-schedule': {
    title: 'Surrender schedule',
    body: 'The annual surrender-charge percentages an annuity contract applies in its first 7-10 years. Withdrawals above the penalty-free percentage during this period are reduced by the schedule percentage. The schedule grades to zero at the end of the surrender period.',
  },
  'penalty-free-percent': {
    title: 'Penalty-free percentage',
    body: 'The portion of the prior anniversary balance an annuity client can withdraw each year without incurring surrender charges. Typically 10% per year during the surrender period.',
  },
  'rollup': {
    title: 'Roll-up rate',
    body: 'On Guaranteed Income products, the annual growth rate applied to the income base (a separate value from the contract cash value) during the deferral period. The income base determines the eventual guaranteed payout amount.',
  },
  'income-base': {
    title: 'Income base',
    body: 'On Guaranteed Income products, a separate value from the contract cash value used to calculate the guaranteed lifetime payout. Grows at the roll-up rate during the deferral period; not directly withdrawable as cash.',
  },
  'widow-penalty': {
    title: 'Widow penalty',
    body: 'When a spouse dies, the survivor moves from MFJ to single filing status. Single brackets are roughly half as wide as MFJ brackets, so the same income hits much higher rates - usually combined with a smaller standard deduction and reduced Social Security (survivor takes higher of two benefits, not the sum).',
  },
  'early-withdrawal-penalty': {
    title: '10% early-withdrawal penalty',
    body: 'A 10% federal penalty on Traditional IRA withdrawals taken before age 59½. Applies on top of ordinary income tax. The conversion itself does not trigger it, but IRA dollars used to pay conversion tax do.',
  },
  'secure-2': {
    title: 'SECURE 2.0',
    body: 'A 2022 federal law that, among other changes, raised the Required Minimum Distribution start age from 72 to 73 (and to 74 starting in 2033) and eliminated RMDs from Roth 401(k) accounts.',
  },
  'tax-payback-age': {
    title: 'Tax-payback age',
    body: 'The age at which the strategy cumulative tax paid drops to or below the baseline cumulative tax paid. The point where the upfront conversion tax has been recouped through smaller RMDs, lower IRMAA, and similar downstream savings.',
  },
  'heir-benefit': {
    title: 'Heir benefit',
    body: 'The reduction in tax liability for heirs from converting Traditional IRA dollars to Roth IRA dollars. Roth dollars pass tax-free; Traditional dollars are taxed at the heir ordinary rate when withdrawn.',
  },
  'social-security': {
    title: 'Social Security',
    body: 'A monthly federal benefit paid to retired workers (and their survivors and dependents). Up to 85% of the benefit can be federally taxable depending on combined income; some states tax it, most do not.',
  },
  'bracket-fill': {
    title: 'Bracket-fill',
    body: 'The mental model that treats taxable income as water filling stacked buckets, where each bucket has a tax rate stamped on the side. Income fills the bottom bucket first, spilling up into higher-rate buckets only after the lower ones are full.',
  },
  'tax-payment-source': {
    title: 'Tax payment source',
    body: 'Where the dollars used to pay conversion tax come from. "From outside" means cash from a brokerage / savings account; "from inside" means an additional withdrawal from the Traditional IRA itself, which triggers the gross-up and (if under 59½) the early-withdrawal penalty.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
