/**
 * Seed the "Delaware Life Momentum Growth Plus" community product — the premium-
 * bonus sibling of "Delaware Life Momentum Growth" (seed-community-delaware-
 * momentum-growth.ts). Built for Jim Billington's Barbara M-B case (Nov 2026).
 *
 * Sourced from Delaware Life's own materials:
 *   - Snapshot MGP783SNAP (Revised 04/26)
 *   - Rate sheet MGP784CRS, current as of 11/02/2026
 *
 * What differs from the base contract (everything else is identical — 10yr
 * 10..1% surrender, 10% free withdrawal, MVA, issue ages 18-80, $25K min):
 *   - 15% premium bonus (14% in CA) on first-year premium
 *   - the bonus VESTS into account value over 10 years (1/10th yr1, 1/9th of the
 *     remainder yr2, ... 100% at end of yr10 — i.e. 10% of the bonus per year).
 *     Death benefit includes the unvested bonus value.
 *   - lower crediting: S&P 500 Dynamic Intraday TCA participation 50% vs 65%
 *     (>= $100K), S&P 500 cap 6.00% vs 10.25%, 1-yr fixed 3.15% vs 4.65%.
 *
 * MODELING NOTES
 *   - The engine credits the full bonus at issue; vesting is stored but not
 *     simulated (no engine consumes vesting_years — see
 *     project-surrender-value-bonus-recapture). That is accurate for whole-
 *     contract in-kind Roth conversions and the death benefit; it overstates
 *     the SURRENDER value in years 1-10.
 *   - VersaGain is NOT simulated, same as the base product: the index side is a
 *     single advisor-set assumed rate. Seeded at 5.0% (below the base's 5.5%,
 *     reflecting ~23% lower participation). No rate_schedule — we have no Plus
 *     illustration to reproduce.
 *
 * Idempotent: upserts on the unique product name. Publishes immediately.
 *
 * Usage: npx tsx scripts/seed-community-delaware-momentum-growth-plus.ts
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
  name: 'Delaware Life Momentum Growth Plus',
  description:
    'Delaware Life Momentum Growth Plus fixed index annuity (accumulation, VersaGain crediting). ' +
    '15% premium bonus (14% CA) that vests over 10 years; 10-year surrender; no income rider. ' +
    'Same contract terms as Momentum Growth, with lower crediting rates (e.g. S&P 500 Dynamic Intraday ' +
    'TCA participation 50% vs 65%, Delaware rate sheet 11/02/2026). MODELING: the bonus is credited at ' +
    'issue (exact for whole-contract Roth conversions and the death benefit; the surrender-value figure ' +
    'ignores the unvested-bonus recapture in years 1-10). VersaGain is NOT simulated — the index side is a ' +
    'single advisor-set assumed rate (seeded 5.0%).',
  carrier_name: 'Delaware Life',
  carrier_product_name: 'Momentum Growth Plus',
  category: 'growth' as const,
  archetype: 'growth-vesting' as const,
  engine_preset: 'vesting-bonus-growth' as const,
  modifier_flags: ['has_mva'] as const,
  source_custom_product_id: null,
  created_by: null,
  is_published: true,
  config: {
    bonus: {
      percentage: 15,
      type: 'immediate',
      applies_to: 'account_value',
      vesting_years: 10,
      vesting_schedule: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      anniversary_rate: null,
      anniversary_years: null,
      confidence: 'verified',
    },
    surrender: {
      years: 10,
      schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      confidence: 'verified',
    },
    fees: {
      // Explicit 0 -> no rider fee (see the base seed).
      annual_rider_fee: 0,
      fee_duration: 'surrender_period',
      confidence: 'verified',
    },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: 'same',
      year_1_custom_percent: null,
      cumulative_withdrawal: false,
      cumulative_percent: null,
      confidence: 'verified',
    },
    income: null,
    other: {
      mva_applies: true,
      return_of_premium_year: null,
      min_premium: 25000,
      max_premium: null,
      min_issue_age: 18,
      max_issue_age: 80,
      confidence: 'verified',
    },
    form_defaults: { rate_of_return: 5 },
    state_availability: {
      not_available: ['NY'],
      bonus_overrides: { CA: 14 },
      age_overrides: {},
      mva_overrides: { CA: false },
      surrender_overrides: { CA: [8, 7.5, 7, 6, 5, 4, 3, 2, 1, 0] },
      vesting_overrides: {},
      min_premium_overrides: {},
      confidence: 'verified',
    },
  },
};

(async () => {
  const { data, error } = await admin
    .from('community_products')
    .upsert(row, { onConflict: 'name' })
    .select('id,name,is_published,category,archetype,engine_preset')
    .single();

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
  console.log('✅ Seeded community product:');
  console.log(JSON.stringify(data, null, 2));
})();
