/**
 * Jim Billington (jim@wealthpilots.net) — client "Barbara M-B" on Delaware Life
 * Momentum Growth Plus. Nov 2026 request: replace an old annuity (6th year)
 * with $550K of Momentum Growth Plus split into 5 x $110K contracts, then Roth-
 * convert one whole contract per year (the carrier allows no partial conversions
 * within a contract).
 *
 *   1. Adopts the "Delaware Life Momentum Growth Plus" community product into
 *      Jim's library (mirrors adoptCommunityProduct; skipped if he has it).
 *      Seed it first: scripts/seed-community-delaware-momentum-growth-plus.ts
 *   2. Creates (or updates) the client.
 *
 * Inputs from Jim's email: single, FL, turns 67 on 11/23 (DOB 1959-11-23),
 * ~$100K/yr income. ASSUMED (not yet confirmed by Jim): the $100K is all
 * taxable non-SS income, and a $300K outside account pays the conversion tax.
 *
 * Conversion: fixed $136,662/yr — the level amount that empties the contracts
 * in exactly 5 conversions (2026-2030) at 5%. The real whole-contract values
 * are $126,500 growing to ~$153,800; the app has no "one contract per year"
 * type yet, and the level amount lands within ~$10K/yr of them.
 *
 * Usage: npx tsx scripts/seed-client-barbara-mb-for-jim.ts [--apply]
 *        (dry-run by default)
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

const ADVISOR_EMAIL = 'jim@wealthpilots.net';
const PRODUCT_NAME = 'Delaware Life Momentum Growth Plus';
const CLIENT_NAME = 'Barbara M-B';
const RATE = 5;
const apply = process.argv.includes('--apply');

(async () => {
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, email, is_active')
    .eq('email', ADVISOR_EMAIL)
    .maybeSingle();
  if (profErr || !profile) {
    console.error(`Could not resolve advisor ${ADVISOR_EMAIL}:`, profErr?.message ?? 'not found');
    process.exit(1);
  }
  console.log(`Advisor: ${profile.email} (${profile.id}) active=${profile.is_active}`);
  console.log(apply ? '\nAPPLYING:' : '\nDRY RUN (pass --apply to write):');

  // 1. Product in Jim's library (adopt from the catalog if missing).
  let { data: product } = await admin
    .from('custom_products')
    .select('id, name, engine_preset, carrier_name, carrier_product_name, config')
    .eq('user_id', profile.id)
    .eq('name', PRODUCT_NAME)
    .maybeSingle();

  if (!product) {
    const { data: src } = await admin.from('community_products').select('*').eq('name', PRODUCT_NAME).maybeSingle();
    if (!src || !src.is_published) {
      console.error(`"${PRODUCT_NAME}" not in the community catalog. Run seed-community-delaware-momentum-growth-plus.ts first.`);
      process.exit(1);
    }
    if (!apply) {
      console.log(`  WOULD ADOPT  ${src.name}`);
    } else {
      const { data, error } = await admin
        .from('custom_products')
        .insert({
          user_id: profile.id,
          name: src.name,
          carrier_name: src.carrier_name,
          carrier_product_name: src.carrier_product_name,
          category: src.category,
          archetype: src.archetype,
          engine_preset: src.engine_preset,
          modifier_flags: src.modifier_flags,
          config: src.config,
          source: 'adopted_from_community',
          community_product_id: src.id,
        })
        .select('id, name, engine_preset, carrier_name, carrier_product_name, config')
        .single();
      if (error) {
        console.error(`  ADOPT FAILED: ${error.message}`);
        process.exit(1);
      }
      product = data;
      console.log(`  ADOPTED ${data.name} (id=${data.id})`);
    }
  } else {
    console.log(`  Product already in library (id=${product.id})`);
  }

  // 2. Client payload — cents throughout.
  const startYear = 2026;
  const endAge = 95;
  const nonSsiIncome = Array.from({ length: endAge - 67 + 1 }, (_, i) => ({
    year: startYear + i,
    age: 67 + i,
    gross_taxable: 10_000_000, // $100,000 — ASSUMED all taxable non-SS; confirm with Jim
    tax_exempt: 0,
    type: 'other',
  }));

  const payload = {
    user_id: profile.id,
    custom_product_id: product?.id ?? null,
    blueprint_type: product?.engine_preset ?? 'vesting-bonus-growth',

    filing_status: 'single',
    name: CLIENT_NAME,
    age: 67,
    date_of_birth: '1959-11-23',
    date_of_birth_exact: true,
    spouse_name: null,
    spouse_age: null,

    qualified_account_value: 55_000_000, // $550,000 premium (5 x $110,000)

    carrier_name: product?.carrier_name ?? 'Delaware Life',
    product_name: product?.carrier_product_name ?? 'Momentum Growth Plus',
    bonus_percent: 15,
    rate_of_return: RATE,
    anniversary_bonus_percent: null,
    anniversary_bonus_years: null,

    state: 'FL',
    state_tax_rate: 0,
    constraint_type: 'bracket_ceiling',
    tax_rate: 24,
    max_tax_rate: 24,
    tax_payment_source: 'from_taxable', // paying from the contracts would trigger surrender + bonus recapture

    ssi_payout_age: 67,
    ssi_annual_amount: 0,
    spouse_ssi_payout_age: 67,
    spouse_ssi_annual_amount: 0,
    non_ssi_income: nonSsiIncome,
    withdrawals: [],

    conversion_type: 'fixed_amount',
    fixed_conversion_amount: 13_666_200, // $136,662/yr x 5 empties the contracts at 5%
    target_partial_amount: null,
    respect_penalty_free_limit: false, // whole-contract in-kind conversions are not withdrawals
    protect_initial_premium: false,

    withdrawal_type: 'no_withdrawals',

    payout_type: 'individual',
    income_start_age: 67,
    guaranteed_rate_of_return: 0,
    roll_up_option: null,
    payout_option: null,
    gi_conversion_years: 5,
    gi_conversion_bracket: 24,

    surrender_years: 10,
    surrender_schedule: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    penalty_free_percent: 10,
    baseline_comparison_rate: RATE, // must match rate_of_return
    post_contract_rate: RATE,
    years_to_defer_conversion: 0,
    end_age: endAge,
    heir_tax_rate: 40,
    widow_analysis: false,
    rmd_treatment: 'reinvested',

    aum_allocation_percent: 0,
    aum_fee_percent: 1,
    aum_dividend_yield: 2,
    aum_turnover_percent: 10,
    aum_withdrawal_years: 5,
    ltcg_rate: 15,

    roth_ira: 0,
    taxable_accounts: 30_000_000, // $300,000 — ASSUMED outside funds for the tax; confirm with Jim

    spouse_dob: null,
    life_expectancy: null,
    traditional_ira: 0,
    other_retirement: 0,
    federal_bracket: 'auto',
    include_niit: false,
    include_aca: false,
    ss_self: 0,
    ss_spouse: 0,
    pension: 0,
    other_income: 0,
    ss_start_age: 67,
    strategy: 'moderate',
    start_age: 67,
    growth_rate: 0,
    inflation_rate: 0,
    heir_bracket: '40',
    projection_years: endAge - 67,
    sensitivity: false,
  };

  const { data: existing } = await admin
    .from('clients')
    .select('id')
    .eq('user_id', profile.id)
    .eq('name', CLIENT_NAME)
    .maybeSingle();

  if (!apply) {
    console.log(`  WOULD ${existing ? `UPDATE client ${existing.id}` : 'CREATE client'} "${CLIENT_NAME}"`);
    process.exit(0);
  }

  const q = existing
    ? admin.from('clients').update(payload).eq('id', existing.id)
    : admin.from('clients').insert(payload);
  const { data: saved, error } = await q.select('id').single();
  if (error) {
    console.error(`  CLIENT ${existing ? 'UPDATE' : 'INSERT'} FAILED: ${error.message}`);
    process.exit(1);
  }
  console.log(`  ${existing ? 'UPDATED' : 'CREATED'} client ${saved.id}`);
  console.log(`  View: https://app.retirementexpert.ai/clients/${saved.id}/results`);
  process.exit(0);
})();
