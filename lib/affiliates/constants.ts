// Payout rules shared by the server (ledger, payout run) and the Refer & Earn
// UI (FAQ copy), so the copy can never drift from what the code does.
// Kept free of server imports so client components can use it.

/** Commissions wait this long before they can be paid out, so a refund in
 *  the first month never leaves us having paid on money we gave back. */
export const COMMISSION_HOLD_DAYS = 30;

/** Balances under this carry over to the next month's run. */
export const MIN_PAYOUT_CENTS = 5000;

/** Day of the month the payout cron runs (see vercel.json). */
export const PAYOUT_DAY_OF_MONTH = 1;
