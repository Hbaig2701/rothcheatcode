// Run: npx tsx lib/affiliates/__tests__/commissions.test.ts
import assert from "node:assert/strict";
import {
  availableAt,
  commissionBaseCents,
  commissionCents,
  reversalCents,
} from "../commissions";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Annual standard plan: $2,970 list, 20% off → $2,376 paid → 30% = $712.80.
test("annual referral earns $712.80", () => {
  const base = commissionBaseCents(237_600, 0);
  assert.equal(commissionCents(base, 30), 71_280);
});

test("tax is excluded from the commission base", () => {
  assert.equal(commissionBaseCents(250_000, 12_400), 237_600);
  assert.equal(commissionBaseCents(1_000, 5_000), 0);
});

test("full refund reverses the whole commission", () => {
  assert.equal(reversalCents(59_400, 237_600, 237_600, 0), -59_400);
});

test("partial refund is pro-rated", () => {
  assert.equal(reversalCents(59_400, 237_600, 118_800, 0), -29_700);
});

test("reversals never exceed the commission", () => {
  // Half already reversed, then a full-amount dispute.
  assert.equal(reversalCents(59_400, 237_600, 237_600, 29_700), -29_700);
  assert.equal(reversalCents(59_400, 237_600, 237_600, 59_400), 0);
  // Refund larger than the invoice (shouldn't happen) is clamped.
  assert.equal(reversalCents(59_400, 237_600, 999_999, 0), -59_400);
});

test("refund on a taxed invoice reverses proportionally to gross", () => {
  // Paid $2,500 incl. $124 tax; commission on $2,376 → $594. Full refund of gross.
  assert.equal(reversalCents(59_400, 250_000, 250_000, 0), -59_400);
});

test("degenerate inputs reverse nothing", () => {
  assert.equal(reversalCents(0, 237_600, 1_000, 0), 0);
  assert.equal(reversalCents(59_400, 0, 1_000, 0), 0);
  assert.equal(reversalCents(59_400, 237_600, 0, 0), 0);
});

test("30-day hold", () => {
  assert.equal(availableAt(new Date("2026-10-13T00:00:00Z")), "2026-11-12T00:00:00.000Z");
});

console.log(`\n${passed} passed`);
