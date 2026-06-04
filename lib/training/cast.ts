/**
 * Training Cast - fixture clients for the Roth Theory curriculum.
 *
 * Each cast member is a fully-populated Client (matching the real DB shape)
 * so the same engine that runs production projections can run them. The
 * playground in each theory module starts from a cast member, applies a
 * user-driven override (e.g. "what if Bob converts $50K?"), and re-runs
 * the engine to show live results.
 *
 * Three archetypes were chosen to cover ~80% of what advisors see:
 *   - bob     - single, pre-RMD, classic "should I convert?" case
 *   - mary    - MFJ couple, widow_analysis enabled, illustrates the widow
 *               penalty (filing-status compression after first death)
 *   - joneses - MFJ, high-balance, IRMAA-cliff territory, gross-up matters
 */

import type { Client } from '@/lib/types/client';

export type CastId = 'bob' | 'mary' | 'joneses';

/**
 * Defaults shared by every cast member - fields that don't vary across the
 * archetypes. Keeping them here lets each cast member focus on the handful
 * of fields that actually define its scenario.
 */
const DEFAULTS = {
  id: 'training-cast',
  user_id: 'training',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',

  blueprint_type: 'fia' as const,
  custom_product_id: null,

  carrier_name: 'Example FIA',
  product_name: 'Example Growth Product',
  bonus_percent: 10,
  rate_of_return: 7,
  anniversary_bonus_percent: null,
  anniversary_bonus_years: null,

  constraint_type: 'bracket_ceiling' as const,
  tax_rate: 22,
  max_tax_rate: 24,
  tax_payment_source: 'from_taxable' as const,
  state_tax_rate: null,

  conversion_type: 'optimized_amount' as const,
  fixed_conversion_amount: null,
  target_partial_amount: null,
  respect_penalty_free_limit: false,
  protect_initial_premium: false,

  withdrawal_type: 'no_withdrawals' as const,

  // GI defaults (not used for the Growth FIA cast members - present so the
  // Client type is satisfied; modules that need GI will override these.)
  payout_type: 'individual' as const,
  income_start_age: 67,
  guaranteed_rate_of_return: 6,
  roll_up_option: null,
  payout_option: null,
  gi_conversion_years: 5,
  gi_conversion_bracket: 24,

  surrender_years: 7,
  surrender_schedule: null,
  penalty_free_percent: 10,
  baseline_comparison_rate: 7,
  post_contract_rate: 5,
  years_to_defer_conversion: 0,
  heir_tax_rate: 40,
  widow_analysis: false,
  widow_death_age: null,
  rmd_treatment: 'reinvested' as const,
  rmds_handled_externally: false,

  aum_allocation_percent: 0,
  aum_fee_percent: 1,
  aum_dividend_yield: 2,
  aum_turnover_percent: 10,
  aum_withdrawal_years: 5,
  ltcg_rate: 15,

  // Legacy fields kept for type-completeness - engine reads the modern ones.
  date_of_birth: null,
  spouse_dob: null,
  life_expectancy: null,
  traditional_ira: 0,
  roth_ira: 0,
  other_retirement: 0,
  federal_bracket: '22',
  include_niit: false,
  include_aca: false,
  ss_self: 0,
  ss_spouse: 0,
  pension: 0,
  other_income: 0,
  ss_start_age: 67,
  strategy: 'moderate' as const,
  start_age: 62,
  growth_rate: 7,
  inflation_rate: 2.5,
  heir_bracket: '40',
  projection_years: 28,
  sensitivity: false,
};

const BOB: Client = {
  ...DEFAULTS,
  id: 'training-cast-bob',
  scenario_name: 'Bob - single, age 62',
  filing_status: 'single',
  name: 'Bob',
  age: 62,
  spouse_name: null,
  spouse_age: null,
  qualified_account_value: 50_000_000, // $500,000
  state: 'TX', // no state tax - keeps the math clean for first-time learners
  gross_taxable_non_ssi: 0,
  tax_exempt_non_ssi: 0,
  ssi_payout_age: 67,
  ssi_annual_amount: 4_000_000, // $40K SS
  spouse_ssi_payout_age: null,
  spouse_ssi_annual_amount: null,
  non_ssi_income: [],
  withdrawals: [],
  end_age: 90,
  taxable_accounts: 50_000_000, // $500K outside funds available for tax payment
};

const MARY: Client = {
  ...DEFAULTS,
  id: 'training-cast-mary',
  scenario_name: 'Mary & George - MFJ, age 70 (widow analysis on)',
  filing_status: 'married_filing_jointly',
  name: 'Mary',
  age: 70,
  spouse_name: 'George',
  spouse_age: 70,
  qualified_account_value: 75_000_000, // $750K
  state: 'FL',
  gross_taxable_non_ssi: 0,
  tax_exempt_non_ssi: 0,
  ssi_payout_age: 67,
  ssi_annual_amount: 4_500_000, // $45K (Mary)
  spouse_ssi_payout_age: 67,
  spouse_ssi_annual_amount: 3_000_000, // $30K (George - typical asymmetry)
  non_ssi_income: [],
  withdrawals: [],
  end_age: 92,
  widow_analysis: true,
  widow_death_age: 78, // George dies at 78; Mary lives 14 more years as a single filer
  taxable_accounts: 30_000_000, // $300K outside funds
  baseline_comparison_rate: 6,
  rate_of_return: 6,
};

const JONESES: Client = {
  ...DEFAULTS,
  id: 'training-cast-joneses',
  scenario_name: 'The Joneses - MFJ, age 65, IRMAA territory',
  filing_status: 'married_filing_jointly',
  name: 'Bill & Linda Jones',
  age: 65,
  spouse_name: 'Linda',
  spouse_age: 65,
  qualified_account_value: 120_000_000, // $1.2M combined IRA
  state: 'NY', // state tax matters for this couple
  state_tax_rate: 6.85,
  gross_taxable_non_ssi: 4_000_000, // $40K pension
  tax_exempt_non_ssi: 0,
  ssi_payout_age: 67,
  ssi_annual_amount: 6_500_000, // $65K (Bill)
  spouse_ssi_payout_age: 67,
  spouse_ssi_annual_amount: 5_500_000, // $55K (Linda)
  non_ssi_income: [],
  withdrawals: [],
  end_age: 90,
  taxable_accounts: 80_000_000, // $800K outside - they have liquidity
  max_tax_rate: 32, // higher ceiling - IRMAA module needs room to push them up
};

export const CAST: Record<CastId, Client> = {
  bob: BOB,
  mary: MARY,
  joneses: JONESES,
};

/**
 * Structured profile for each cast member.
 *   - intro:   one-line summary used on the curriculum index card
 *   - facts:   bullet points shown on the module page Featuring panel.
 *              Acronyms are expanded on first use ("married filing
 *              jointly (MFJ)") so an advisor unfamiliar with the
 *              shorthand isn't lost.
 *   - context: closing tagline that explains why this client is
 *              the right archetype to teach the concept.
 */
export interface CastBlurb {
  intro: string;
  facts: string[];
  context: string;
}

export const CAST_BLURB: Record<CastId, CastBlurb> = {
  bob: {
    intro: 'Bob - single filer, age 62',
    facts: [
      'Filing status: single (no spouse, no dependents)',
      'Age 62 - pre-retirement, pre-Required Minimum Distributions (RMDs)',
      '$500,000 in a Traditional IRA',
      'Social Security starts at age 67: $40,000/year',
      '$500,000 in a taxable brokerage account (available to pay conversion tax)',
      'Texas resident - no state income tax',
    ],
    context: 'The classic "should I convert before RMDs hit?" case.',
  },
  mary: {
    intro: 'Mary & George - both age 70, married filing jointly (MFJ)',
    facts: [
      'Mary and George - both age 70',
      'Filing status: married filing jointly (MFJ)',
      '$750,000 in a Traditional IRA',
      "Mary's Social Security: $45,000/year",
      "George's Social Security: $30,000/year",
      'Florida residents - no state income tax',
      'Widow analysis enabled: George passes at age 78; Mary lives another 14 years as a single filer',
    ],
    context: 'Used to demonstrate Required Minimum Distributions (RMDs) and the widow penalty.',
  },
  joneses: {
    intro: 'Bill & Linda Jones - both age 65, married filing jointly (MFJ)',
    facts: [
      'Bill and Linda Jones - both age 65',
      'Filing status: married filing jointly (MFJ)',
      '$1.2 million in a Traditional IRA (combined)',
      "Bill's Social Security at 67: $65,000/year",
      "Linda's Social Security at 67: $55,000/year",
      'Pension income: $40,000/year',
      'New York residents - 6.85% state income tax',
      '$800,000 in a taxable brokerage account',
    ],
    context: 'Big enough to bump into Income-Related Monthly Adjustment Amount (IRMAA) tiers and to need careful conversion sizing.',
  },
};
