/**
 * Send a sample signup-continuation email to a test address so we can
 * visually verify it before it goes out to real customers.
 *
 * Usage: npx tsx scripts/test-signup-continuation-email.ts <email>
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { sendSignupContinuationEmail } from '../lib/notifications/email';

config({ path: resolve(process.cwd(), '.env.local') });

const to = process.argv[2];
if (!to) {
  console.error('Usage: npx tsx scripts/test-signup-continuation-email.ts <email>');
  process.exit(1);
}

(async () => {
  await sendSignupContinuationEmail({
    to,
    sessionId: 'cs_test_preview_only',
    firstName: 'Test',
  });
  console.log(`Sent preview email to ${to}`);
  process.exit(0);
})();
