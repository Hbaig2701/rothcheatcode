/**
 * One-shot admin script to reset a single user's password.
 *
 * Usage:
 *   npx tsx scripts/reset-password.ts <userId> <newPassword>
 *
 * Reads SUPABASE_URL + SERVICE_ROLE_KEY from .env.local.
 *
 * NOT a public utility — keep usage gated behind the developer running
 * it locally. Do NOT add a Vercel route or CLI alias for this.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const userId = process.argv[2];
const newPassword = process.argv[3];

if (!userId || !newPassword) {
  console.error('Usage: npx tsx scripts/reset-password.ts <userId> <newPassword>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) {
    console.error('Password reset failed:', error.message);
    process.exit(1);
  }
  console.log(`Password reset for ${data.user?.email ?? userId}.`);
  process.exit(0);
})();
