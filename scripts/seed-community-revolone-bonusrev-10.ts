/**
 * Seed the two "Revol One BonusRev 10" community products (Core 16% / Max 22%
 * premium bonus options). Requested by Andrew Perri (Pinnacle Wealth), ticket
 * c446fdd8, Nov 2026.
 *
 * Sourced from Revol One's own materials (attached to the ticket):
 *   - BonusRev consumer brochure REVB(1)-MKTG-0126 Rev 10.19.2026
 *   - State availability REVB(8)-ADMIN-0126 Rev 08.03.2026 (not in CA or NY)
 *   - Roth Conversions FAQ ROTH(1)-MKTG-0626 Rev 9.24.2026
 *
 * Contract terms (both options):
 *   - 10-year surrender. Group A states 10,9,...,1%; Group B 12,11,...,3%.
 *   - Premium bonus vests: Group A 0,10,...,90% (beginning of policy years 1-10,
 *     100% from year 11); Group B 0,0,0,0,0,10,20,40,60,80%.
 *   - Free partial surrender 10% of INITIAL premium a year, from issue. RMDs are
 *     always penalty-free but COUNT toward the 10%.
 *   - MVA. Issue ages 0-85. $10K min, $1M max (higher with company approval).
 *   - Roth conversion: in-kind to a single child Roth annuity (same contract
 *     date + surrender schedule), full or partial, any number of years. The
 *     unvested bonus moves to the Roth and is NOT in the reported taxable amount.
 * Option differences:
 *   - Core: 16% bonus (11% issue ages 71-85), no fee, no carryover.
 *   - Max: 22% bonus (15% ages 71-85), 0.95% Annual Product Fee on the
 *     Accumulation Value every anniversary (lifetime), unused free amount carries
 *     over up to 20% of premium.
 *
 * MODELING NOTES (what the engine does NOT reproduce):
 *   - Issue age 71-85: set the client's Bonus % to 11 (Core) / 15 (Max).
 *   - Full bonus credited at issue; vesting is stored, not simulated (surrender
 *     value overstated in years 1-10; see project-surrender-value-bonus-recapture).
 *   - Conversions are taxed on the full converted value INCLUDING the unvested
 *     bonus, while Revol One reports only the vested part as taxable. So the
 *     conversion tax is overstated while the bonus is unvested (the report is
 *     conservative on this point).
 *   - The penalty-free cap (only if the advisor turns it on) is a % of contract
 *     value, not of initial premium, so it's a little looser than the contract.
 *   - Crediting (caps/par rates, Index Lock) isn't simulated; the index side is a
 *     single advisor-set assumed rate (seeded 6%).
 *
 * Idempotent: upserts on the unique product name. Publishes immediately.
 *
 * Usage: npx tsx scripts/seed-community-revolone-bonusrev-10.ts
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

// Group B states (brochure p.4 / p.10). Group A is the base schedule; MT, NM,
// VT and WV are available but listed in neither group — they get Group A.
const GROUP_B = ['AL', 'AR', 'AZ', 'CO', 'DC', 'GA', 'HI', 'IA', 'KS', 'MA', 'ME', 'MI', 'NC', 'ND', 'NE', 'NH', 'RI', 'SD', 'TN', 'WI', 'WY'];
const SURRENDER_A = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const SURRENDER_B = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3];
const VESTING_A = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const VESTING_B = [0, 0, 0, 0, 0, 10, 20, 40, 60, 80];
const forGroupB = <T,>(v: T) => Object.fromEntries(GROUP_B.map((s) => [s, v]));

const COMMON_NOTES =
  '10-year surrender (10%→1% in most states; 12%→3% in Group B states), MVA, 10% of premium free each year from issue ' +
  '(RMDs count toward it), issue ages 0-85, not available in CA or NY. Roth conversions go in-kind into one Roth child ' +
  'contract with the same surrender schedule. MODELING: the bonus is credited at issue; conversions are taxed on the full ' +
  'value including any unvested bonus (Revol One reports only the vested part as taxable, so conversion tax is overstated ' +
  'while the bonus is unvested); the index side is a single assumed rate (seeded 6%). Issue ages 71-85 get a smaller bonus — ' +
  'edit the client\'s Bonus %.';

function product(opts: { name: string; productName: string; bonus: number; fee: number; carry: boolean; blurb: string }) {
  return {
    name: opts.name,
    description: opts.blurb + ' ' + COMMON_NOTES,
    carrier_name: 'Revol One Financial',
    carrier_product_name: opts.productName,
    category: 'growth' as const,
    archetype: 'growth-vesting' as const,
    engine_preset: 'vesting-bonus-growth' as const,
    modifier_flags: [
      'has_mva',
      ...(opts.fee > 0 ? ['has_annual_fee'] : []),
      ...(opts.carry ? ['has_cumulative_withdrawal'] : []),
    ],
    source_custom_product_id: null,
    created_by: null,
    is_published: true,
    config: {
      bonus: {
        percentage: opts.bonus,
        type: 'vesting',
        applies_to: 'account_value',
        vesting_years: 10,
        vesting_schedule: VESTING_A,
        anniversary_rate: null,
        anniversary_years: null,
        confidence: 'verified',
      },
      surrender: { years: 10, schedule: SURRENDER_A, confidence: 'verified' },
      fees: {
        annual_rider_fee: opts.fee,
        // Max: "deducted on the first anniversary and every anniversary date
        // thereafter" — the engine honors 'lifetime' (getEffectiveGrowthRiderFeeYears).
        fee_duration: opts.fee > 0 ? 'lifetime' : 'surrender_period',
        confidence: 'verified',
      },
      withdrawals: {
        penalty_free_percent: 10,
        year_1_rule: 'same',
        year_1_custom_percent: null,
        cumulative_withdrawal: opts.carry,
        cumulative_percent: opts.carry ? 20 : null,
        confidence: 'verified',
      },
      income: null,
      other: {
        mva_applies: true,
        return_of_premium_year: null,
        min_premium: 10000,
        max_premium: 1000000,
        min_issue_age: 0,
        max_issue_age: 85,
        confidence: 'verified',
      },
      form_defaults: { rate_of_return: 6 },
      state_availability: {
        not_available: ['CA', 'NY'],
        bonus_overrides: {},
        age_overrides: {},
        mva_overrides: {},
        surrender_overrides: forGroupB(SURRENDER_B),
        vesting_overrides: forGroupB(VESTING_B),
        min_premium_overrides: {},
        confidence: 'verified',
      },
    },
  };
}

const rows = [
  product({
    name: 'Revol One BonusRev 10 (Core 16% Bonus)',
    productName: 'BonusRev 10 FIA — Core Premium Bonus',
    bonus: 16,
    fee: 0,
    carry: false,
    blurb: 'Revol One BonusRev 10 fixed index annuity, Core Premium Bonus option: 16% premium bonus (11% at issue ages 71-85) that vests over 10 years, no annual fee.',
  }),
  product({
    name: 'Revol One BonusRev 10 (Max 22% Bonus)',
    productName: 'BonusRev 10 FIA — Max Premium Bonus',
    bonus: 22,
    fee: 0.95,
    carry: true,
    blurb: 'Revol One BonusRev 10 fixed index annuity, Max Premium Bonus option: 22% premium bonus (15% at issue ages 71-85) that vests over 10 years, 0.95% annual product fee on the accumulation value every year (not just the surrender period), unused free withdrawal carries over up to 20%.',
  }),
];

(async () => {
  for (const row of rows) {
    const { data, error } = await admin
      .from('community_products')
      .upsert(row, { onConflict: 'name' })
      .select('id,name,is_published,category,archetype,engine_preset')
      .single();
    if (error) {
      console.error('Seed failed:', row.name, error.message);
      process.exit(1);
    }
    console.log('✅ Seeded community product:', JSON.stringify(data));
  }
})();
