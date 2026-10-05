/**
 * Seed the "Knighthead Chartline Bonus 10" community product.
 *
 * Built from Knighthead Life's Chartline Bonus brochure (D198 4/26), product
 * overview (D202 04/26), rate sheet + state availability guide (8/5/2026), and
 * Jorge Tola's illustration (Maurice Nasrallah, FL, $2,000,000, age 74,
 * prepared 09/22/2026). Jorge asked for the 10-year term specifically.
 *
 *   - 20% premium bonus credited to contract value at issue (issue ages 0–75).
 *     Ages 76–80 get 10% — the engine has no age-banded bonus, so an advisor
 *     with a 76–80 client must change the bonus on the client form.
 *   - Bonus recapture 100/90/80/.../10% by contract year applies only to
 *     surrender, annuitization, or EXCESS withdrawals — never to death, and
 *     never to Roth conversions kept within the free-withdrawal amount. The
 *     engine never surrenders, so the full 20% is correctly in the account
 *     value from day one and recapture is irrelevant to the conversion math.
 *   - No fees, no rider charge.
 *   - 10-year withdrawal charge schedule 9/9/8/7/6/5/4/3/2/1; MVA applies.
 *   - Free withdrawals: year 1 = 0% (RMDs only), year 2+ = 10% of the
 *     prior-anniversary contract value. Not cumulative.
 *   - Min premium $25,000; max $2,000,000 without home-office approval.
 *   - Not licensed: NY, VT, NH, MA, CT (state guide map, 8/5/2026). CA, FL, SC
 *     are marked "coming soon" on that guide, but the illustration was issued
 *     in FL on 9/22/2026, so those are treated as available.
 *
 * VALIDATION (scripts/validate-knighthead-chartline-bonus-10.ts): with 20%
 * bonus, 0% credited and the carrier's own 10%-of-prior-value withdrawal
 * column, runGrowthSimulation reproduces the illustration's Guaranteed
 * Illustrated Values page (p.5) for all 20 years to within $1 (the carrier
 * chains whole-dollar rounded withdrawals). No engine changes required.
 *
 * The rate_of_return default is the 1-year S&P 500 cap for the $100K+ band:
 * 6.00%. RATE SOURCE NOTE — the 8/5/2026 rate sheet shows 5.50% ($100K+) /
 * 5.00% (under $100K), but Jorge Tola's 9/22/2026 illustration (p.3, "Current
 * Rate") shows 6.00%, and Jorge confirmed 6.00% / 5.50% by the bands. The
 * illustration is the newer source and only two rates moved, both by +0.50%:
 * the S&P 500 cap (5.50→6.00, including inside all three model portfolios) and
 * the Fixed Strategy (2.50→3.00). Every other strategy is unchanged, so this is
 * a targeted cap increase, not a stale sheet across the board. Under $100K the
 * cap is 5.50% — advisors on the low band must lower the rate by hand.
 * The carrier's own 10-year historical annual effective rates ran 5.83%–8.06%.
 * Advisors should set the rate per client.
 *
 * Idempotent: upserts on the unique product name. Publishes immediately.
 *
 * Usage: npx tsx scripts/seed-community-knighthead-chartline-bonus-10.ts
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
  name: 'Knighthead Chartline Bonus 10',
  description:
    "Knighthead Life Chartline Bonus fixed indexed annuity, 10-year withdrawal charge period: 20% premium bonus credited at issue (issue ages 0–75; ages 76–80 receive 10% — change the bonus on the client form for those clients), no fees, 10% free withdrawals from contract year 2 (year 1: RMDs only), MVA applies. Reproduces the carrier's guaranteed illustration page to the dollar. Default rate is the 1-year S&P 500 cap for premium of $100K or more (6.00%, per the 9/22/2026 illustration); under $100K the cap is 5.50%, so lower the Rate of Return for those clients. Set the credited rate per client. Not licensed in NY, VT, NH, MA, CT. Note: the surrender-value figure does not include premium-bonus recapture, so it overstates the carrier's surrender value during the withdrawal charge period — this does NOT affect the Roth conversion or legacy numbers.",
  carrier_name: 'Knighthead Life (Merit Life Insurance Co.)',
  carrier_product_name: 'Chartline Bonus — 10-Year Withdrawal Charge Period (20% bonus)',
  category: 'growth' as const,
  archetype: 'growth-immediate' as const,
  engine_preset: 'high-bonus-long-term-growth' as const,
  modifier_flags: ['has_mva'] as string[],
  config: {
    bonus: {
      percentage: 20,
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
      schedule: [9, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      confidence: 'verified',
    },
    fees: {
      annual_rider_fee: 0,
      fee_duration: 'surrender_period',
      confidence: 'verified',
    },
    withdrawals: {
      penalty_free_percent: 10,
      year_1_rule: 'custom',
      year_1_custom_percent: 0, // year 1: RMDs only, no free withdrawal
      cumulative_withdrawal: false,
      cumulative_percent: null,
      confidence: 'verified',
    },
    income: null,
    other: {
      mva_applies: true,
      return_of_premium_year: null,
      min_premium: 25000,
      max_premium: 2000000,
      min_issue_age: 0,
      max_issue_age: 80,
      confidence: 'verified',
    },
    form_defaults: {
      // 1-year S&P 500 cap, $100K+ band (9/22/2026 illustration p.3).
      // Under $100K the cap is 5.50%.
      rate_of_return: 6.0,
    },
    state_availability: {
      not_available: ['NY', 'VT', 'NH', 'MA', 'CT'],
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
