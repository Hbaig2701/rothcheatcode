/**
 * Phase 6 — Real-data sweep (READ-ONLY).
 *
 * Run: npm run test:audit:realdata
 *
 * Pulls real client records from Supabase and runs the core invariants on each,
 * catching real-world data shapes synthetic fixtures miss (stale rate fields,
 * odd income schedules, custom products, AUM splits). Strictly read-only — it
 * never writes. Not part of `test:audit` (needs DB credentials).
 *
 * Caveat: custom_product_id clients are run against the SYSTEM preset here
 * (customProduct is not loaded), so their numbers may differ slightly from
 * production; the invariants (conservation/composition/non-negativity) still
 * apply regardless of product config.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import type { Client } from '../../../types/client';
import { dispatch, engineFor } from './factory';
import {
  Reporter,
  checkFinite,
  checkNonNegative,
  checkNetWorthComposition,
  checkTotalTaxComposition,
  checkTraditionalTieOut,
} from './assertions';

config({ path: resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — skipping real-data sweep.');
  process.exit(0);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  const { data, error } = await admin.from('clients').select('*').limit(1000);
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  const clients = (data ?? []) as Client[];
  const r = new Reporter();
  let ran = 0, skipped = 0, threw = 0;

  for (const c of clients) {
    if (!c.age || !c.end_age || c.end_age <= c.age || !c.blueprint_type) { skipped++; continue; }
    const name = `${(c.name ?? 'client').slice(0, 24)}#${String(c.id).slice(0, 8)} [${engineFor(c)}/${c.blueprint_type}]`;
    let out;
    try {
      out = dispatch(c, 2026);
    } catch (e) {
      threw++;
      r.record({ fixture: name, scenario: 'formula', check: 'engine-threw', note: (e as Error).message });
      continue;
    }
    ran++;
    for (const [scenario, years] of [['baseline', out.baseline], ['formula', out.formula]] as const) {
      checkFinite(r, name, scenario, years);
      checkNonNegative(r, name, scenario, years);
      checkNetWorthComposition(r, name, scenario, years);
      checkTotalTaxComposition(r, name, scenario, years);
      if (engineFor(c) !== 'gi') checkTraditionalTieOut(r, name, scenario, years);
    }
  }

  console.log(`real clients: ${clients.length} total · ${ran} swept · ${skipped} skipped (incomplete) · ${threw} threw`);
  r.print('Phase 6 — Real-data sweep');
  process.exit(r.breaches.length > 0 ? 1 : 0);
})();
