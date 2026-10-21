/**
 * Correct the two Athene Performance Elite 10 community products.
 *
 * Bo Lee (ticket Oct 21 2026) reported the product defaulting to a 26% premium
 * bonus when Georgia's current bonus is 22%. He is right, and Georgia is not
 * the reason: Georgia is a "most states" state in Athene's own grouping, so it
 * takes the standard rate. The 26% was hand-entered (source=manual) in June
 * 2026 with no document behind it.
 *
 * SOURCES
 *  - Athene Product Guide, rates effective April 16 2021 (form 68069, extracted
 *    from the PDF): establishes the STRUCTURE — "Most states" (incl. GA) vs
 *    AK/CT/DE/ID/MN/NJ/NV/OH/OK/OR/PA/SC/TX/UT/WA vs CA vs FL(65-78)+MD, and
 *    "Annual Rider Charge Rate: N/A | 0.95%" for Base | Plus.
 *  - Athene rates dated 9/25/2026 as reported by two independent third parties:
 *    base Performance Elite 10 at 22% most states, Plus at 25%, FL ages 65-78
 *    at 13%, bonus unavailable in AK/CT/DE/NY/TX and reduced in CA/FL/MD.
 *
 * WHAT THIS CHANGES
 *  1. The row named "Athene Performance Elite 10" carried a 0.95% rider fee and
 *     carrier_product_name "Performance Elite 10 Plus" — both Plus signatures,
 *     so an advisor reaching for the base contract got the Plus. It becomes the
 *     real BASE: 22% bonus, NO rider fee, names made consistent.
 *  2. The row named "Performance Elite 10 Plus" becomes the real PLUS: 25%
 *     bonus, 0.95% rider fee retained.
 *  3. The stale bonus_overrides are REMOVED from both. They were built against
 *     a 26% base and put 19 states at 24% — against a 22% base that would make
 *     those states richer than most states, which is incoherent, and the real
 *     reductions are far larger (Florida 65-78 is 13%, not 20%). A table that
 *     silently asserts wrong numbers is worse than no table plus an explicit
 *     warning, so the description now names the states that differ and tells
 *     the advisor to set the bonus by hand for them.
 *
 * WHAT THIS DOES NOT FIX, and why
 *  - Per-state current values for CA, MD, AK, CT, DE, TX. Not published; needs
 *    Athene's current rate sheet.
 *  - Florida CANNOT be encoded at all: the bonus depends on issue age (22% for
 *    0-64, 13% for 65-78) and `bonus_overrides` is Record<state, number> with
 *    no age dimension.
 *  - The Premium Bonus Vesting / recapture charts are not modelled by the
 *    engine (nothing in lib/calculations reads vesting_overrides), so storing
 *    them would change no projection.
 *
 * Adopted advisor copies are independent snapshots and are NOT touched by this
 * — it corrects what advisors get from here on. Existing clients keep their
 * saved bonus_percent and need separate handling.
 *
 * Usage: npx tsx scripts/fix-athene-performance-elite-10.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } });

const STATE_WARNING =
  "IMPORTANT — verify the premium bonus for your client's state and issue age before illustrating. " +
  "Athene's bonus is NOT uniform: as of the 9/25/2026 rates it is unavailable in AK, CT, DE and TX, " +
  "reduced in CA and MD, and in Florida it depends on issue age (ages 65-78 receive 13%, not the " +
  "standard rate). Those per-state figures are not pre-filled here because the software stores one " +
  "bonus per state and cannot express Florida's age bands — set the Premium Bonus field by hand for " +
  "those states. The default shown is the most-states rate, which covers Georgia and the majority of " +
  "jurisdictions.";

async function main() {
  const { data: rows, error } = await admin.from('community_products')
    .select('id, name, carrier_name, carrier_product_name, config, description').ilike('name', '%Elite%');
  if (error) throw error;

  const plan: Array<{ id: string; label: string; patch: Record<string, unknown>; before: string; after: string }> = [];

  for (const r of rows ?? []) {
    const cfg = JSON.parse(JSON.stringify(r.config)) as Record<string, any>;
    const isPlus = /plus/i.test(r.name);
    const bonus = isPlus ? 25 : 22;
    const rider = isPlus ? 0.95 : 0;
    const before = `bonus ${cfg.bonus.percentage}%, rider ${cfg.fees.annual_rider_fee}%, ` +
      `${Object.keys(cfg.state_availability?.bonus_overrides ?? {}).length} state overrides, ` +
      `carrier_product_name "${r.carrier_product_name}"`;

    cfg.bonus.percentage = bonus;
    cfg.bonus.confidence = 'verified';
    cfg.fees.annual_rider_fee = rider;
    cfg.state_availability = {
      ...(cfg.state_availability ?? {}),
      not_available: ['NY'],
      bonus_overrides: {},
      // 'unverified' is NOT in the ConfidenceLevel enum (verified | assumed |
      // not_found | partial) and silently broke productConfigSchema on both rows.
      // 'partial' is the accurate word anyway: the state table is incomplete.
      confidence: 'partial',
    };

    const name = isPlus ? 'Athene Performance Elite 10 Plus' : 'Athene Performance Elite 10';
    const cpn = isPlus ? 'Performance Elite 10 Plus' : 'Performance Elite 10';
    const desc = isPlus
      ? `Athene Performance Elite 10 Plus — the enhanced version of the Performance Elite 10: a higher premium bonus (${bonus}% most states) plus additional free withdrawals, in exchange for a ${rider}% annual rider charge deducted from the accumulated value during the withdrawal charge period. ${STATE_WARNING}`
      : `Athene Performance Elite 10 — the base contract: ${bonus}% premium bonus (most states) and NO annual rider charge. If your client's contract carries the 0.95% rider charge and a higher bonus, use "Athene Performance Elite 10 Plus" instead. ${STATE_WARNING}`;

    plan.push({
      id: r.id, label: `${r.name} -> ${name}`,
      patch: { name, carrier_product_name: cpn, config: cfg, description: desc },
      before,
      after: `bonus ${bonus}%, rider ${rider}%, 0 state overrides, carrier_product_name "${cpn}"`,
    });
  }

  for (const p of plan) {
    console.log(`\n${p.label}`);
    console.log(`  before: ${p.before}`);
    console.log(`  after : ${p.after}`);
  }
  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to write.\n'); return; }
  for (const p of plan) {
    const { error: e } = await admin.from('community_products').update(p.patch).eq('id', p.id);
    console.log(`${e ? 'FAILED' : 'updated'} ${p.label}${e ? ': ' + e.message : ''}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
