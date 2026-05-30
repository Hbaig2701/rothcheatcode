/**
 * Delete the admin_metrics_cache row so the next /admin page load
 * forces a fresh recompute from Stripe (using the fixed code).
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

(async () => {
  const { error, count } = await admin
    .from('admin_metrics_cache')
    .delete({ count: 'exact' })
    .eq('key', 'revenue');
  if (error) {
    console.error('Delete failed:', error.message);
    process.exit(1);
  }
  console.log(`Deleted ${count ?? 0} revenue cache row(s).`);
})();
