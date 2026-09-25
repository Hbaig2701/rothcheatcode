/**
 * Seed the "Delaware Life Momentum Growth" community product.
 *
 * Models Delaware Life's Momentum Growth fixed index annuity (the accumulation
 * FIA carrying the VersaGain crediting feature). Sourced from ShieldFirst Wealth
 * illustration (Valued Client, Male age 64, $1,000,000 Qualified, prepared
 * 07/20/2026) + the Momentum Growth / VersaGain product brochures.
 *
 * Product shape (verified against illustration pages 6, 8, 18):
 *   - NO premium bonus (issue account value = premium = $1,000,000)
 *   - 10yr surrender schedule: 10,9,8,7,6,5,4,3,2,1 (standard states)
 *   - NO income rider / rider fee (pure accumulation product)
 *   - 10% free withdrawal (greater of 10% AV or RMD); MVA on excess
 *   - Guaranteed floor: 1% fixed / 0% index
 *   - Delaware Life is not authorized in NY -> not_available: ['NY']
 *
 * MODELING NOTE — VersaGain is intentionally NOT simulated. Our growth engine
 * abstracts index crediting into a single flat assumed `rate_of_return`; it has
 * no participation-rate, cap-rate, point-to-point, or earnings-at-risk feedback
 * mechanics. VersaGain's variable participation (65%->148%) and protect-vs-risk
 * split cannot be reproduced by a flat rate and are not needed for the Roth-
 * conversion comparison (baseline and strategy use the same rate; the decision
 * is driven by tax mechanics, not the carrier's lumpy hypothetical path). We
 * reproduce the GUARANTEED page exactly and treat the index side as a single
 * advisor-set assumed rate. Default seeded at a defensible 5.5% (NOT the ~18%
 * backtest the hypothetical columns imply). Because there is no premium bonus,
 * the surrender-value bonus-recapture limitation that affects high-bonus FIAs
 * does NOT apply here — surrender values are accurate.
 *
 * Idempotent: upserts on the unique product name. Publishes immediately.
 *
 * Usage: npx tsx scripts/seed-community-delaware-momentum-growth.ts
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
  name: 'Delaware Life Momentum Growth',
  description:
    'Delaware Life Momentum Growth fixed index annuity (accumulation, VersaGain crediting). ' +
    'No premium bonus; 10-year surrender; no income rider. Guaranteed floor 1% fixed / 0% index. ' +
    'MODELING: the VersaGain variable-participation / earnings-at-risk mechanic is NOT simulated — ' +
    'the engine models the index side as a single advisor-set assumed rate (seeded 5.5%). This is ' +
    'exact on the guaranteed page and fit for Roth-conversion planning, but does not reproduce the ' +
    'carrier illustration\'s hypothetical year-by-year path (which implies a ~18% backtested CAGR). ' +
    'No premium bonus means surrender values are accurate (no bonus-recapture overstatement).',
  carrier_name: 'Delaware Life',
  carrier_product_name: 'Momentum Growth',
  category: 'growth' as const,
  archetype: 'growth-no-bonus' as const,
  engine_preset: 'short-term-cap-growth' as const,
  modifier_flags: ['has_mva'] as const,
  source_custom_product_id: null,
  created_by: null,
  is_published: true,
  config: {
    bonus: {
      percentage: 0,
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
      schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      confidence: 'verified',
    },
    fees: {
      // 0 is an EXPLICIT override -> engine applies no rider fee (getEffectiveGrowthRiderFee
      // only falls back to the preset default on null/undefined, not on 0).
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
      min_issue_age: 0,
      max_issue_age: 80,
      confidence: 'verified',
    },
    form_defaults: { rate_of_return: 5.5 },
    state_availability: {
      not_available: ['NY'],
      bonus_overrides: {},
      age_overrides: {},
      mva_overrides: {},
      surrender_overrides: {},
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
