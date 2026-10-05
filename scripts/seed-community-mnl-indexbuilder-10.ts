/**
 * Seed the "MNL IndexBuilder 10 (Enhanced Rider)" community product.
 *
 * Models the configuration in Midland National's illustration (Jeffrey McLeod,
 * AR, $1M, prepared 06/19/2026) — the Additional Benefit Rider election:
 *   - 24% premium bonus (base 17% + 7% ABR enhancement), credited at issue
 *   - 0.95% annual rider charge, assessed during the 10yr surrender period only
 *   - 10yr surrender schedule: 10,10,9,9,8,8,7,6,4,2
 *   - 10% penalty-free withdrawals (20% from yr 3 if none taken prior year)
 *   - Return of Premium available from contract year 4; MVA applies
 *
 * VALIDATION (scripts/_tmp-validate-mnl2.ts, run before seeding): with bonus
 * 24%, rider 0.95% × 10yrs, and a flat 5% credited rate, runGrowthSimulation
 * reproduces the carrier's "Fixed 5.00%" page (page 9) to the DOLLAR across all
 * 51 years (issue $1,240,000 → age-115 $13,571,278). The rider correctly stops
 * after year 10 (yr 11 grows at the full 5%). In a real Roth projection the only
 * divergence from the carrier table is RMDs from age 75 — which our engine
 * applies (legally required on a qualified IRA) and the carrier illustration
 * omits. No engine changes required; the growth engine already models the
 * rider-during-surrender mechanic (growth-formula.ts step 2.5).
 *
 * Idempotent: upserts on the unique product name. Publishes immediately.
 *
 * Usage: npx tsx scripts/seed-community-mnl-indexbuilder-10.ts
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

const row = {
  name: 'MNL IndexBuilder 10 (Enhanced Rider)',
  description:
    "Midland National MNL IndexBuilder 10 fixed index annuity, modeled with the Additional Benefit Rider: 24% premium bonus (credited at issue) and a 0.95% annual rider charge during the 10-year surrender period. Matches the carrier's Fixed-5% illustration to the dollar. Pick your credited rate per client. Note: the surrender-value figure does not include premium-bonus recapture, so it overstates the carrier's surrender value during the surrender period — this does NOT affect the Roth conversion or legacy numbers, which use accumulation value.",
  carrier_name: 'Midland National Life Insurance Company',
  carrier_product_name: 'MNL IndexBuilder 10 — Additional Benefit Rider (24% bonus / 0.95% charge)',
  category: 'growth' as const,
  archetype: 'growth-immediate' as const,
  engine_preset: 'high-bonus-long-term-growth' as const,
  modifier_flags: ['has_annual_fee', 'has_return_of_premium', 'has_mva'] as string[],
  config: {
    bonus: {
      percentage: 24,
      type: 'immediate',
      applies_to: 'account_value',
      vesting_years: null,
      vesting_schedule: null,
      anniversary_rate: null,
      anniversary_years: null,
      confidence: 'verified',
    },
    surrender: {
      years: 10,
      schedule: [10, 10, 9, 9, 8, 8, 7, 6, 4, 2],
      confidence: 'verified',
    },
    fees: {
      annual_rider_fee: 0.95,
      fee_duration: 'surrender_period',
      confidence: 'verified',
    },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: 'same',
      year_1_custom_percent: null,
      cumulative_withdrawal: true, // 20% from yr 3 if none taken the prior year
      cumulative_percent: 20,
      confidence: 'verified',
    },
    income: null,
    other: {
      mva_applies: true,
      return_of_premium_year: 4,
      min_premium: 20000,
      max_premium: null,
      min_issue_age: 0,
      max_issue_age: 79,
      confidence: 'verified',
    },
    form_defaults: {
      // The carrier's clean "Fixed 5.00%" supplemental illustration, which our
      // engine reproduces exactly. Advisors should adjust per client/scenario
      // (carrier's most-recent 10yr AER was 5.20%, lowest 4.07%, highest 6.36%).
      rate_of_return: 5.0,
    },
    state_availability: {
      not_available: [],
      bonus_overrides: {},
      age_overrides: {},
      mva_overrides: {},
      surrender_overrides: {},
      vesting_overrides: {},
      min_premium_overrides: {},
      confidence: 'verified',
    },
  },
  source_custom_product_id: null as string | null,
  created_by: null as string | null,
  is_published: true,
};

(async () => {
  const { data, error } = await admin
    .from('community_products')
    .upsert(row, { onConflict: 'name' })
    .select('id, name, is_published')
    .single();
  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
  console.log(`Seeded community product: ${data.name} (id=${data.id}, published=${data.is_published})`);
  process.exit(0);
})();
