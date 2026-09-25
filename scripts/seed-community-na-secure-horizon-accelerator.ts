/**
 * Seed the North American Secure Horizon Accelerator community products.
 *
 * Seeds BOTH builds of the same contract, because the Strategy Charge election
 * materially changes the product:
 *   1. "North American Secure Horizon Accelerator"            — no Strategy Charge
 *   2. "North American Secure Horizon Accelerator (0.95% Strategy Charge)"
 *      — 0.95% charged annually against the accumulation value during the
 *        10-year surrender period, in exchange for materially higher
 *        participation rates (e.g. Performance Strategy Ladder 5-year on
 *        Loomis Sayles Managed Futures 2: 360% vs 295%).
 *
 * Both are single-premium deferred FIAs, accumulation only — no income rider,
 * no roll-up, no benefit base.
 *
 * BONUS / SURRENDER VARY BY STATE. Base values are the "Standard" state group;
 * the IIPRC & 70/10 group is applied via state_availability overrides:
 *   Standard (AL AR AZ CO DC FL GA IA IL KS KY ME MI MS NC ND NE NM RI SD TN
 *             VT WV WI): 19% bonus, surrender 10/10/10/10/10/9/8/7/6/4
 *   IIPRC & 70/10 (AK CT DE HI ID IN LA MA MO MT NH NJ NV OH OK PA SC TX WA WY):
 *             18% bonus, surrender 9/8.5/7.5/6.5/5.5/4.5/3.5/3/2/1
 * SEVEN states appear in NEITHER published bonus group: CA, MD, MN, NY, OR, UT,
 * VA. That is NOT evidence the product isn't sold there — Maryland is named in
 * the illustration's own model-regulation list (states where NA won't illustrate
 * the Loomis/GEARS indices), so the product plainly exists in at least one of
 * them. Absence from the bonus tables means "no published bonus rate," not "not
 * available." Per the rule documented in app/api/products/research/route.ts
 * (~L216-230), `not_available` is reserved for states where the PRODUCT ITSELF
 * is not sold; when in doubt, leave the state out and warn instead. So
 * not_available is EMPTY and the uncovered states are called out in the
 * description — they fall through to the 19% base, which an advisor must verify
 * with the carrier before quoting.
 *
 * (The premium-bonus flyer 40680Z is marked "NOT FOR USE IN OREGON", but that
 * restricts THAT marketing piece / the bonus special, not the contract.)
 *
 * The bonus includes a 6% "premium bonus special" (13%/12% base + 6%) which the
 * carrier can modify or discontinue at any time without notice. Rate sheet
 * 40075Z is dated 5/27/26 — re-check before quoting.
 *
 * VALIDATION (scripts/validate-na-secure-horizon.ts, run before seeding): with
 * an 18% bonus, no strategy charge and a flat 5% credited rate,
 * runGrowthSimulation reproduces the carrier's "Fixed 5.00% Return" page
 * (illustration p.12, Jeanine Horner, TX, $708,000) to the DOLLAR across all 21
 * printed checkpoints — issue $835,440 → year 30 $3,610,724. No engine changes
 * required.
 *
 * KNOWN APPROXIMATION — Performance Strategy Ladder: the ladder splits premium
 * into five 20% buckets on staggered 1-5 year terms, so credited interest is
 * lumpy by construction (illustration p.11: 1.00%, 4.90%, 4.26% ... 15.66% in
 * year 10, then alternating 0% / 25.30% on the 2-year point-to-point). Our
 * engine models a single contract rate plus a post-surrender renewal rate, not
 * a per-year rate schedule. Compounded totals track if the assumed average is
 * right; the year-by-year shape is smoothed. Logged in WISHLIST.md.
 *
 * Idempotent: upserts on the unique product name. Publishes immediately.
 *
 * Usage: npx tsx scripts/seed-community-na-secure-horizon-accelerator.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// -- State groups (product guide 40528Z, REV 4-26) ---------------------------

/** IIPRC & 70/10 states: 18% bonus, softer surrender schedule. */
const IIPRC_70_10_STATES = [
  'AK', 'CT', 'DE', 'HI', 'ID', 'IN', 'LA', 'MA', 'MO', 'MT',
  'NH', 'NJ', 'NV', 'OH', 'OK', 'PA', 'SC', 'TX', 'WA', 'WY',
];

const STANDARD_SURRENDER = [10, 10, 10, 10, 10, 9, 8, 7, 6, 4];
const IIPRC_SURRENDER = [9, 8.5, 7.5, 6.5, 5.5, 4.5, 3.5, 3, 2, 1];

const STANDARD_BONUS = 19;
const IIPRC_BONUS = 18;

const bonusOverrides: Record<string, number> = {};
const surrenderOverrides: Record<string, number[]> = {};
for (const st of IIPRC_70_10_STATES) {
  bonusOverrides[st] = IIPRC_BONUS;
  surrenderOverrides[st] = IIPRC_SURRENDER;
}

// -- Shared config ------------------------------------------------------------

const sharedConfig = {
  bonus: {
    percentage: STANDARD_BONUS,
    type: 'immediate' as const,
    applies_to: 'account_value' as const,
    vesting_years: null,
    vesting_schedule: null,
    anniversary_rate: null,
    anniversary_years: null,
    confidence: 'verified' as const,
  },
  surrender: {
    years: 10,
    schedule: STANDARD_SURRENDER,
    confidence: 'verified' as const,
  },
  withdrawals: {
    // 7% of beginning-of-year accumulation value, starting in contract year 2.
    penalty_free_percent: 7,
    year_1_rule: 'custom' as const,
    year_1_custom_percent: 0,
    cumulative_withdrawal: false,
    cumulative_percent: null,
    confidence: 'verified' as const,
  },
  income: null,
  other: {
    mva_applies: true,
    return_of_premium_year: null,
    min_premium: 25_000,
    max_premium: null,
    min_issue_age: 0,
    max_issue_age: 79,
    confidence: 'verified' as const,
  },
  state_availability: {
    // Deliberately empty — see the header note. No source says the contract is
    // unavailable in any state; the seven states missing from the bonus tables
    // are warned about in the description instead of being blocked.
    not_available: [] as string[],
    bonus_overrides: bonusOverrides,
    age_overrides: {},
    mva_overrides: {},
    surrender_overrides: surrenderOverrides,
    vesting_overrides: {},
    min_premium_overrides: {},
    confidence: 'verified' as const,
  },
};

const CAVEATS =
  'Bonus and surrender schedule vary by state and are applied automatically from the client\'s state ' +
  '(19% / 10-10-10-10-10-9-8-7-6-4 in standard states; 18% / 9-8.5-7.5-6.5-5.5-4.5-3.5-3-2-1 in IIPRC & 70/10 states, incl. TX). ' +
  'IMPORTANT — seven states appear in neither published bonus group: CA, MD, MN, NY, OR, UT and VA. ' +
  'For a client in one of those, this model falls back to the 19% base bonus, which may be wrong — confirm the bonus with the carrier before quoting. ' +
  'The bonus includes a 6% premium bonus special the carrier can modify or discontinue at any time — rate sheet dated 5/27/26, re-check before quoting. ' +
  'The Performance Strategy Ladder credits on staggered 1-5 year terms, so the carrier\'s year-by-year rate is lumpy; ' +
  'this model uses one credited rate (plus an optional post-surrender renewal rate), which tracks compounded totals but smooths the annual shape. ' +
  'Two display caveats: the surrender-value figure applies the surrender charge only, so it omits premium-bonus recapture and overstates surrender value during the 10-year period; ' +
  'and the MVA is noted but not simulated. Neither affects the Roth conversion or legacy numbers, which use accumulation value.';

const rows = [
  {
    name: 'North American Secure Horizon Accelerator',
    description:
      'North American Secure Horizon Accelerator fixed index annuity — single-premium deferred, accumulation only (no income rider). ' +
      'Modeled without the optional Strategy Charge, matching the carrier\'s illustration for a 100% Performance Strategy Ladder allocation. ' +
      'Reproduces the carrier\'s Fixed-5% illustration page to the dollar. Pick your credited rate per client. ' +
      CAVEATS,
    carrier_name: 'North American Company for Life and Health Insurance',
    carrier_product_name: 'Secure Horizon Accelerator (no Strategy Charge)',
    category: 'growth' as const,
    archetype: 'growth-immediate' as const,
    engine_preset: 'high-bonus-long-term-growth' as const,
    modifier_flags: ['has_mva'] as string[],
    config: {
      ...sharedConfig,
      fees: {
        annual_rider_fee: 0,
        fee_duration: 'surrender_period' as const,
        confidence: 'verified' as const,
      },
      // The carrier's clean "Fixed 5.00%" supplemental page, which our engine
      // reproduces exactly. Advisors should adjust per client. For reference the
      // illustrated Performance Strategy Ladder 10-year annual effective rates
      // were 8.38% most recent / 14.07% highest / 7.49% lowest — but those are
      // backcast on indices that mostly launched in 2023-2025.
      form_defaults: { rate_of_return: 5.0 },
    },
    source_custom_product_id: null as string | null,
    created_by: null as string | null,
    is_published: true,
  },
  {
    name: 'North American Secure Horizon Accelerator (0.95% Strategy Charge)',
    description:
      'North American Secure Horizon Accelerator fixed index annuity — single-premium deferred, accumulation only (no income rider). ' +
      'Modeled WITH the optional 0.95% Strategy Charge, deducted from the accumulation value on each contract anniversary during the 10-year surrender period. ' +
      'In exchange the participation rates are materially higher (e.g. Performance Strategy Ladder 5-year on Loomis Sayles Managed Futures 2: 360% vs 295% without the charge), ' +
      'so pair this build with a higher assumed credited rate than the no-charge build. ' +
      'Not modeled: the Accumulation Value True-Up, a one-time credit at the end of year 10 if total interest credited came in below total strategy charges — it only bites in a sustained flat-to-down market. ' +
      CAVEATS,
    carrier_name: 'North American Company for Life and Health Insurance',
    carrier_product_name: 'Secure Horizon Accelerator (0.95% Strategy Charge)',
    category: 'growth' as const,
    archetype: 'growth-immediate' as const,
    engine_preset: 'high-bonus-long-term-growth' as const,
    modifier_flags: ['has_annual_fee', 'has_mva'] as string[],
    config: {
      ...sharedConfig,
      fees: {
        annual_rider_fee: 0.95,
        fee_duration: 'surrender_period' as const,
        confidence: 'verified' as const,
      },
      // Higher default than the no-charge build: the charge buys higher par
      // rates. Carrier's illustrated ladder AERs with the charge ran ~13.6%
      // most recent on GEARS; 6% is a deliberately conservative starting point.
      form_defaults: { rate_of_return: 6.0 },
    },
    source_custom_product_id: null as string | null,
    created_by: null as string | null,
    is_published: true,
  },
];

(async () => {
  for (const row of rows) {
    const { data, error } = await admin
      .from('community_products')
      .upsert(row, { onConflict: 'name' })
      .select('id, name, is_published')
      .single();
    if (error) {
      console.error(`Seed failed for "${row.name}":`, error.message);
      process.exit(1);
    }
    console.log(`Seeded community product: ${data.name} (id=${data.id}, published=${data.is_published})`);
  }
  process.exit(0);
})();
