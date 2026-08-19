/**
 * Regression test: config.rate_schedule must survive the product-save round-trip.
 *
 * WHY THIS EXISTS
 * `rate_schedule` is declared on ProductConfigPayload (lib/products/types.ts) and
 * consumed by the growth engine (getEffectiveRateSchedule / rateFromSchedule), but
 * it was never added to productConfigSchema in lib/products/validators.ts. Zod
 * strips unknown keys by default, so:
 *
 *   PUT /api/products/[id]  →  updateCustomProductSchema.safeParse(body)   ← key gone
 *                          →  repository.updateCustomProduct()
 *                          →  `updates.config = input.config`             ← whole-column replace
 *
 * There is no merge to fall back on, so ONE save from the product form permanently
 * dropped the schedule and silently reverted the product to flat-rate crediting —
 * no error, nothing in the response. This hit real data: "Delaware Life Momentum
 * Growth" is a published community product carrying a 30-year schedule, with
 * advisor-adopted copies in the wild.
 *
 * Pure in-process schema test — no DB, no network.
 *
 * Usage: npx tsx scripts/test-rate-schedule-roundtrip.ts
 */

import { productConfigSchema } from "../lib/products/validators";

let failures = 0;
const check = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
};

// Minimal config that satisfies every required block in productConfigSchema.
const baseConfig = {
  bonus: {
    percentage: 18,
    type: "immediate" as const,
    applies_to: "account_value" as const,
  },
  surrender: { years: 3, schedule: [9, 8.5, 7.5] },
  fees: { annual_rider_fee: 0, fee_duration: "surrender_period" as const },
  withdrawals: {
    penalty_free_percent: 7,
    year_1_rule: "custom" as const,
    year_1_custom_percent: 0,
    cumulative_withdrawal: false,
  },
  other: { mva_applies: true },
  state_availability: {
    not_available: [],
    bonus_overrides: {},
    age_overrides: {},
  },
  form_defaults: { rate_of_return: 5 },
};

console.log("\nrate_schedule round-trip through productConfigSchema\n");

// 1. A schedule survives parsing.
const SCHEDULE = [0.012212, 0.1193416, 0.4954056, -0.0312, 0];
const withSchedule = productConfigSchema.safeParse({ ...baseConfig, rate_schedule: SCHEDULE });
check("parses a config carrying rate_schedule", withSchedule.success);
if (withSchedule.success) {
  const out = (withSchedule.data as { rate_schedule?: number[] | null }).rate_schedule;
  check("rate_schedule is NOT stripped", out !== undefined, out === undefined ? "key vanished" : "");
  check(
    "values round-trip exactly",
    JSON.stringify(out) === JSON.stringify(SCHEDULE),
    `got ${JSON.stringify(out)}`
  );
}

// 2. Negative and >100% years are allowed. A carrier illustration can show a down
//    year or a +49.5% year; clamping like rate_of_return would corrupt real data.
const extremes = productConfigSchema.safeParse({ ...baseConfig, rate_schedule: [-0.25, 1.5] });
check("allows negative and >100% yearly returns", extremes.success);

// 3. Absent / null still fine — every other product must keep flat-rate behavior.
const absent = productConfigSchema.safeParse(baseConfig);
check("config with no rate_schedule still valid", absent.success);
const nulled = productConfigSchema.safeParse({ ...baseConfig, rate_schedule: null });
check("explicit null accepted", nulled.success);

// 4. Junk is rejected rather than silently coerced.
const junk = productConfigSchema.safeParse({ ...baseConfig, rate_schedule: ["0.05", "oops"] });
check("rejects a non-numeric schedule", !junk.success);

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
