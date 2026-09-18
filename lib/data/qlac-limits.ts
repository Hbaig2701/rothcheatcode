/**
 * IRS QLAC limits. Kept in a dependency-free module so the client-side form
 * validation and the engine overlay share ONE source of truth.
 *
 * Premium cap: SECURE 2.0 §202 set $200K, indexed for inflation in $10K
 * steps — $210K for 2025 and 2026 (IRS Notice 2025-67). Per person, lifetime,
 * across all IRAs/plans. Update here when the IRS publishes the next step.
 */
export const QLAC_PREMIUM_LIMIT_CENTS = 21_000_000;

/** Income must begin no later than the month after the 85th birthday. */
export const QLAC_MAX_INCOME_START_AGE = 85;
export const QLAC_DEFAULT_INCOME_START_AGE = 85;
/** Form lower bound — no IRS floor, but nothing below this is a real quote. */
export const QLAC_MIN_INCOME_START_AGE = 50;
