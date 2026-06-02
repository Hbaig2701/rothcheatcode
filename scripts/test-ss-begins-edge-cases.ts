/**
 * Edge-case smoke test for the "Social Security Begins" / "Spouse SS Begins"
 * Story Mode suppression fix. Walks the lifecycle for nine realistic and
 * adversarial input shapes, runs the engine + story generator, and checks
 * which SS-related milestones fire.
 *
 * Expected truth table for the "Begins" milestone:
 *   - client.age >  claim_age  →  SUPPRESSED (already collecting)
 *   - client.age == claim_age  →  FIRES      (starting this projection year)
 *   - client.age <  claim_age  →  FIRES      (when projection reaches claim age)
 *
 * Run: npx tsx scripts/test-ss-begins-edge-cases.ts
 */
import { runGrowthFormulaScenario } from "../lib/calculations/scenarios/growth-formula";
import { generateStory } from "../lib/calculations/story-generator";
import type { Client } from "../lib/types/client";

type ExpectedFlag = "fires" | "suppressed";

interface TestCase {
  name: string;
  client: Partial<Client>;
  expect: {
    primarySsBegins: ExpectedFlag;
    spouseSsBegins: ExpectedFlag;
  };
}

const BASE_CLIENT: Partial<Client> = {
  age: 75,
  spouse_age: 73,
  filing_status: "married_filing_jointly",
  state: "CA",
  qualified_account_value: 130_000_000,
  roth_ira: 0,
  taxable_accounts: 0,
  ssi_payout_age: 69,
  ssi_annual_amount: 4_200_000,
  spouse_ssi_payout_age: 67,
  spouse_ssi_annual_amount: 3_000_000,
  spouse_name: "Kristi",
  tax_rate: 24,
  max_tax_rate: 32,
  state_tax_rate: 9.3,
  conversion_type: "optimized_amount",
  constraint_type: "bracket_ceiling",
  tax_payment_source: "from_ira",
  blueprint_type: "vesting-bonus-growth",
  rate_of_return: 7,
  bonus_percent: 19,
  end_age: 95,
  heir_tax_rate: 40,
  non_ssi_income: [],
  withdrawals: [],
  rmd_treatment: "reinvested",
  baseline_comparison_rate: 7,
  post_contract_rate: 7,
  years_to_defer_conversion: 0,
  penalty_free_percent: 10,
  surrender_years: 10,
  respect_penalty_free_limit: false,
  penalty_free_scope: "tax_only",
  protect_initial_premium: true,
};

const CASES: TestCase[] = [
  {
    name: "1. Both spouses already collecting (Policar's real case)",
    client: { age: 75, ssi_payout_age: 69, spouse_age: 73, spouse_ssi_payout_age: 67 },
    expect: { primarySsBegins: "suppressed", spouseSsBegins: "suppressed" },
  },
  {
    name: "2. Primary already collecting, spouse not yet",
    client: { age: 75, ssi_payout_age: 69, spouse_age: 60, spouse_ssi_payout_age: 67 },
    expect: { primarySsBegins: "suppressed", spouseSsBegins: "fires" },
  },
  {
    name: "3. Primary not yet, spouse already collecting",
    client: { age: 60, ssi_payout_age: 67, spouse_age: 75, spouse_ssi_payout_age: 67 },
    expect: { primarySsBegins: "fires", spouseSsBegins: "suppressed" },
  },
  {
    name: "4. Neither collecting yet (typical pre-retirement case)",
    client: { age: 60, ssi_payout_age: 67, spouse_age: 58, spouse_ssi_payout_age: 67 },
    expect: { primarySsBegins: "fires", spouseSsBegins: "fires" },
  },
  {
    name: "5. Primary claiming THIS year (edge: age === claim age)",
    client: { age: 67, ssi_payout_age: 67, spouse_age: 65, spouse_ssi_payout_age: 67 },
    expect: { primarySsBegins: "fires", spouseSsBegins: "fires" },
  },
  {
    name: "6. Spouse claiming THIS year (edge: spouse age === spouse claim age)",
    client: { age: 75, ssi_payout_age: 69, spouse_age: 67, spouse_ssi_payout_age: 67 },
    expect: { primarySsBegins: "suppressed", spouseSsBegins: "fires" },
  },
  {
    name: "7. Single filer (no spouse) already collecting",
    client: {
      age: 75, ssi_payout_age: 69,
      filing_status: "single", spouse_name: null, spouse_age: null,
      spouse_ssi_payout_age: null, spouse_ssi_annual_amount: 0,
    },
    expect: { primarySsBegins: "suppressed", spouseSsBegins: "suppressed" },
  },
  {
    name: "8. Single filer, will claim later",
    client: {
      age: 62, ssi_payout_age: 67,
      filing_status: "single", spouse_name: null, spouse_age: null,
      spouse_ssi_payout_age: null, spouse_ssi_annual_amount: 0,
    },
    expect: { primarySsBegins: "fires", spouseSsBegins: "suppressed" },
  },
  {
    name: "9. Delayed past 70 (claim age 73, current age 75) — already collecting",
    client: { age: 75, ssi_payout_age: 73, spouse_age: 73, spouse_ssi_payout_age: 70 },
    expect: { primarySsBegins: "suppressed", spouseSsBegins: "suppressed" },
  },
];

function mergeClient(overrides: Partial<Client>): Client {
  // Cast through unknown — Client is wide; this test wires only the engine-relevant subset.
  return { ...BASE_CLIENT, ...overrides } as unknown as Client;
}

let passCount = 0;
let failCount = 0;

for (const tc of CASES) {
  const client = mergeClient(tc.client);
  const startYear = 2026;
  const projYears = (client.end_age ?? 95) - (client.age ?? 75);
  const years = runGrowthFormulaScenario(client, startYear, projYears, null);
  const projection = { blueprint_years: years, baseline_years: years } as any;
  const story = generateStory(client, projection);

  const primaryFired = story.some(
    (e: any) => e.trigger === "social_security_start",
  );
  const spouseFired = story.some(
    (e: any) => e.trigger === "spouse_ss_start",
  );

  const got = {
    primarySsBegins: primaryFired ? "fires" : "suppressed",
    spouseSsBegins: spouseFired ? "fires" : "suppressed",
  };

  const ok =
    got.primarySsBegins === tc.expect.primarySsBegins &&
    got.spouseSsBegins === tc.expect.spouseSsBegins;

  if (ok) {
    passCount++;
    console.log(`PASS  ${tc.name}`);
    console.log(`       primary=${got.primarySsBegins}  spouse=${got.spouseSsBegins}`);
  } else {
    failCount++;
    console.log(`FAIL  ${tc.name}`);
    console.log(`       expected primary=${tc.expect.primarySsBegins} spouse=${tc.expect.spouseSsBegins}`);
    console.log(`       got      primary=${got.primarySsBegins} spouse=${got.spouseSsBegins}`);
  }
}

console.log(`\n${passCount}/${passCount + failCount} cases pass`);
if (failCount > 0) process.exit(1);
