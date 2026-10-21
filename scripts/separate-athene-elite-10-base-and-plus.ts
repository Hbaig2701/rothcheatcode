/**
 * Separate the Athene Performance Elite 10 BASE contract from the 10 PLUS.
 *
 * The bonus and rider fee were corrected in fix-athene-performance-elite-10.ts.
 * This fixes the rest: every Plus-only feature was applied to BOTH entries, so
 * the "base" contract was illustrating liquidity and guarantees it does not have.
 *
 * SOURCE: Athene Product Guide, form 68069 (04/16/21), extracted from the PDF.
 * Verbatim:
 *   "Free Withdrawal Percentage Schedule   Y1 | Y2+ | Plus Y1 | Plus Y2+
 *                                          0% |  5% |   10%   |   10%"
 *   "Enhanced Free Withdrawals (Plus only) The free withdrawal amount is
 *    increased to 10% per year and may be taken as early as the first contract
 *    year. If no withdrawals are taken in a given year, up to 20% of the
 *    Accumulated Value is available for withdrawal in the next year."
 *   "Return of Premium (Plus only) After the fourth contract year..."
 *   "Withdrawal Charge Duration 10 years"
 *   "Chart A: AL,AZ,AR,CO,DC,FL(ages0-64),GA,HI,... Contract Yr 1..11+
 *    Charge% 12 12 12 11 10 9 8 7 6 4 0"
 *   "Minimum $10,000 ($5,000 in CT,ID,MN,NJ,OH,OR,PA,UT,WA)"
 *   "Market Value Adjustment (Not applicable in MD & MO)"
 *
 * WHAT WAS WRONG ON THE BASE (all Plus-only, all applied to it):
 *   - penalty_free_percent 10  -> 5, with year 1 at 0% (base Y1 is 0%, not 10%)
 *   - cumulative_withdrawal true/20% -> false (that is Enhanced Free
 *     Withdrawals, Plus only). This one is NOT cosmetic: the engine models the
 *     carry-forward (getEffectiveCumulativePenaltyFree), so the base contract
 *     was being credited a 20% second-year allowance it does not have.
 *   - return_of_premium_year 4 -> null (Plus only)
 *   - surrender.years 11 -> 10. The charge duration is 10 years; the 11th row
 *     of Chart A is the 0% "11+" row, not an eleventh charge year. years=11
 *     pushed the contract/post-contract rate switch out by a year.
 *   - bonus.vesting_years 11 -> 10, to match the charge duration.
 *
 * WHAT WAS WRONG ON THE PLUS:
 *   - bonus.vesting_schedule was truncated to 10 entries; Chart A has 11, ending
 *     at 100%. Documentation-only (nothing in lib/calculations reads it) but
 *     wrong is wrong.
 *
 * BOTH GAIN: mva_overrides for MD and MO (the guide says the MVA does not apply
 * there) and min_premium_overrides for the nine $5,000 states.
 *
 * Schedules are stored as 10 entries for both. The engine returns a 0% charge
 * past the end of the array, so a 10-entry schedule and an 11-entry one ending
 * in 0 behave identically — and 10 matches the stated duration.
 *
 * NOT CHANGED: max_issue_age (base 78, Plus 70). No clean source; the 78 comes
 * from Chart C's "FL ages 65-78" band, which is a state chart, not an issue-age
 * limit. Needs the rate sheet.
 *
 * Usage: npx tsx scripts/separate-athene-elite-10-base-and-plus.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } });

const CHART_A_CHARGES = [12, 12, 12, 11, 10, 9, 8, 7, 6, 4];        // yrs 1-10; 11+ is 0%
const CHART_A_VESTING = [0, 0, 0, 0, 0, 0, 20, 40, 60, 80, 100];     // yrs 1-11+
const LOW_MIN_STATES = ['CT', 'ID', 'MN', 'NJ', 'OH', 'OR', 'PA', 'UT', 'WA'];

async function main() {
  const { data: rows, error } = await admin.from('community_products')
    .select('id, name, config, modifier_flags').ilike('name', '%Performance Elite 10%');
  if (error) throw error;

  for (const r of rows ?? []) {
    const isPlus = /plus/i.test(r.name);
    const cfg = JSON.parse(JSON.stringify(r.config)) as Record<string, any>;
    const before = {
      pf: cfg.withdrawals.penalty_free_percent, y1: cfg.withdrawals.year_1_rule,
      y1p: cfg.withdrawals.year_1_custom_percent, cum: cfg.withdrawals.cumulative_withdrawal,
      cumP: cfg.withdrawals.cumulative_percent, rop: cfg.other.return_of_premium_year,
      sy: cfg.surrender.years, sl: cfg.surrender.schedule.length, vy: cfg.bonus.vesting_years,
      vl: (cfg.bonus.vesting_schedule ?? []).length,
    };

    cfg.surrender.years = 10;
    cfg.surrender.schedule = [...CHART_A_CHARGES];
    cfg.surrender.confidence = 'verified';
    cfg.bonus.vesting_years = 10;
    cfg.bonus.vesting_schedule = [...CHART_A_VESTING];

    if (isPlus) {
      cfg.withdrawals = { ...cfg.withdrawals, penalty_free_percent: 10, year_1_rule: 'same',
        year_1_custom_percent: null, cumulative_withdrawal: true, cumulative_percent: 20,
        confidence: 'verified' };
      cfg.other.return_of_premium_year = 4;
    } else {
      cfg.withdrawals = { ...cfg.withdrawals, penalty_free_percent: 5, year_1_rule: 'custom',
        year_1_custom_percent: 0, cumulative_withdrawal: false, cumulative_percent: null,
        confidence: 'verified' };
      cfg.other.return_of_premium_year = null;
    }

    cfg.other = { ...cfg.other, mva_applies: true,
      min_premium: 10000, max_premium: 1000000, confidence: 'verified' };
    cfg.state_availability = { ...cfg.state_availability,
      mva_overrides: { MD: false, MO: false },
      min_premium_overrides: Object.fromEntries(LOW_MIN_STATES.map((s) => [s, 5000])) };

    // Flags must follow the config, or the product picker advertises features the
    // contract does not have. The base carries no rider charge and no Return of
    // Premium (both Plus-only), yet both flags were set on it.
    const flags = new Set((r.modifier_flags ?? []) as string[]);
    flags.add('has_mva');
    for (const [flag, on] of [
      ['has_cumulative_withdrawal', isPlus],
      ['has_annual_fee', isPlus],          // rider charge: N/A on base, 0.95% on Plus
      ['has_return_of_premium', isPlus],   // Plus only, after the 4th contract year
    ] as Array<[string, boolean]>) {
      if (on) flags.add(flag); else flags.delete(flag);
    }

    const after = {
      pf: cfg.withdrawals.penalty_free_percent, y1: cfg.withdrawals.year_1_rule,
      y1p: cfg.withdrawals.year_1_custom_percent, cum: cfg.withdrawals.cumulative_withdrawal,
      cumP: cfg.withdrawals.cumulative_percent, rop: cfg.other.return_of_premium_year,
      sy: cfg.surrender.years, sl: cfg.surrender.schedule.length, vy: cfg.bonus.vesting_years,
      vl: cfg.bonus.vesting_schedule.length,
    };
    console.log(`\n${r.name}  (${isPlus ? 'PLUS' : 'BASE'})`);
    for (const k of Object.keys(before) as Array<keyof typeof before>) {
      const b = JSON.stringify(before[k]), a = JSON.stringify(after[k]);
      console.log(`  ${String(k).padEnd(5)} ${b === a ? '  (unchanged) ' + b : `${b}  ->  ${a}`}`);
    }
    console.log(`  flags -> ${[...flags].join(', ')}`);

    if (APPLY) {
      const { error: e } = await admin.from('community_products')
        .update({ config: cfg, modifier_flags: [...flags] }).eq('id', r.id);
      console.log(`  ${e ? 'FAILED: ' + e.message : 'WRITTEN'}`);
    }
  }
  if (!APPLY) console.log('\nDRY RUN — re-run with --apply to write.\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
