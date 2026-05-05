#!/usr/bin/env node
/**
 * Standalone test of the AI product research prompt + guardrails.
 * Calls Anthropic directly (bypassing auth) and runs the same normalization
 * + auto-correct logic as /api/products/research, then prints a verdict.
 *
 * Usage: node scripts/test-product-research.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// Load .env.local
const envFile = readFileSync(path.resolve(".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  // Strip surrounding quotes (Vercel env pull wraps in double quotes)
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[m[1]] = val;
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY missing");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Mirror of ARCHETYPE_TO_ENGINE_PRESET
const ARCHETYPE_TO_ENGINE_PRESET = {
  "growth-vesting": "vesting-bonus-growth",
  "growth-phased": "phased-bonus-growth",
  "growth-immediate": "high-bonus-long-term-growth",
  "growth-no-bonus": "short-term-cap-growth",
  "income-simple-both": "simple-rollup-income",
  "income-simple-base": "simple-rollup-income",
  "income-compound-flat": "flat-rate-compound-income",
  "income-compound-split": "compound-rollup-income",
};

// Inline copy of the system prompt (kept in sync with route.ts manually for testing)
const SYSTEM_PROMPT = `You are a product research assistant for a Roth conversion planning platform. Your job is to research fixed index annuity (FIA) products and extract their parameters for our calculation engine. ACCURACY MATTERS — every parameter is used in client illustrations. Errors mislead advisors and clients.

## Research Approach (REQUIRED)

1. ALWAYS use web search. Do not guess from prior knowledge.
2. PRIORITIZE official carrier sources (carrier .com domains, agent guides, spec sheet PDFs). Use third-party reviews (annuityeducator, annuityadvantage, retirementwatch, wink) only to corroborate.
3. Search at least 4 distinct sources before finalizing any answer. Cross-check the bonus percentage and surrender period across sources — if they disagree, prefer the official one and flag the conflict in warnings.
4. Read the actual spec sheet text. Do not infer from the URL or meta description.
5. If you cannot find a parameter explicitly, set it to a reasonable default and mark its confidence as "assumed" or "not_found" — DO NOT silently make up a value with "verified" confidence.

## Archetype Decision Tree (FOLLOW EXACTLY)

ASK these questions IN ORDER for Growth products:

Q1: Does the product have a premium bonus?
   → If 0% or not mentioned: archetype = growth-no-bonus. STOP.
   → If >0% premium bonus: continue to Q2.

Q2: Does the bonus have a vesting schedule (recaptured if you surrender early)?
   → If YES: archetype = growth-vesting. STOP.
   → If NO: continue to Q3.

Q3: Does the product credit ADDITIONAL anniversary bonuses?
   → If YES: archetype = growth-phased. STOP.
   → If NO: archetype = growth-immediate. STOP.

For Income products:

Q1: Simple or Compound roll-up?
Q2: If COMPOUND, one rate or tiered? (flat vs split)
Q3: If SIMPLE, bonus on both AV+IB or IB only?

## Worked Examples

| Product | Archetype |
|---|---|
| Athene Performance Elite 7 | growth-immediate (5% upfront, immediate) |
| Athene Performance Elite Plus 15 | growth-vesting (22% vests over 15yr) |
| American Equity AssetShield 10 | growth-vesting |
| Lincoln OptiBlend 7 | growth-no-bonus |
| EquiTrust MarketEdge Bonus | growth-phased |
| American Equity IncomeShield 10 | income-simple-both |
| EquiTrust MarketEarly Income | income-compound-split |
| North American NAC BPA | income-compound-flat |

## Hard Constraints

- IMPOSSIBLE: bonus.percentage > 0 AND archetype = "growth-no-bonus"
- IMPOSSIBLE: archetype = "growth-vesting" AND bonus.vesting_years is null
- IMPOSSIBLE: archetype = "growth-phased" AND (anniversary_rate is null OR anniversary_years is null)
- REQUIRED: surrender.schedule MUST have exactly surrender.years entries
- REQUIRED: category MUST match archetype prefix

## Output Format

Respond with ONE JSON object enclosed in <json>...</json> tags. Structure:

<json>
{
  "product_found": true,
  "carrier": "...",
  "carrier_product_name": "...",
  "suggested_generic_name": "...",
  "category": "growth" | "income",
  "archetype": "...",
  "modifier_flags": [...],
  "parameters": {
    "bonus": { "percentage": N, "type": "vesting"|"immediate"|"phased"|"none", "vesting_years": N|null, "vesting_schedule": "linear"|null, "anniversary_rate": N|null, "anniversary_years": N|null, "applies_to": "both"|"income_base"|"account_value"|null, "confidence": "verified"|"assumed"|"partial"|"not_found" },
    "surrender": { "years": N, "schedule": [N,...], "confidence": "..." },
    "fees": { "annual_rider_fee": N, "fee_duration": "surrender_period"|"lifetime"|N, "confidence": "..." },
    "withdrawals": { "penalty_free_percent": N, "year_1_rule": "same"|"interest_only"|"custom", "year_1_custom_percent": N|null, "cumulative_withdrawal": bool, "cumulative_percent": N|null, "confidence": "..." },
    "income": null | { "roll_up_type": "simple"|"compound", "roll_up_rate": N, "roll_up_split_rate": bool, "roll_up_rate_years_1_5": N|null, "roll_up_rate_years_6_10": N|null, "roll_up_max_years": N, "bonus_applies_to": "both"|"income_base"|"account_value"|null, "payout_factors": { "single": {"55": N, ...}, "joint": {...} }, "payout_increment_per_year": N, "enhanced_income": null|{...}, "confidence": "..." },
    "other": { "mva_applies": bool, "return_of_premium_year": N|null, "min_premium": N|null, "max_premium": N|null, "min_issue_age": N|null, "max_issue_age": N|null, "confidence": "..." },
    "state_availability": null|{ "not_available": [...], "bonus_overrides": {...}, "age_overrides": {...}, "confidence": "..." },
    "form_defaults": { "rate_of_return": N }
  },
  "sources": [{ "url": "...", "type": "official"|"third_party" }],
  "warnings": [{ "field": "...", "message": "...", "resolution": "assumed"|"not_found"|"ambiguous" }],
  "unsupported_features": []
}
</json>

If product cannot be found: <json>{"product_found": false, "reason": "..."}</json>

Respond with the JSON only inside <json>...</json> tags.`;

function extractJson(text) {
  const tag = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tag) return tag[1].trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// Mirror the guardrail logic from route.ts
function applyGuardrails(parsed) {
  let archetype = parsed.archetype;
  const params = parsed.parameters || {};
  const warnings = parsed.warnings || [];
  const correctionsApplied = [];

  // Ensure nested structures exist
  params.bonus = params.bonus || { percentage: 0, type: "none" };
  params.surrender = params.surrender || { years: 0, schedule: [] };

  if (archetype === "growth-no-bonus" && (params.bonus.percentage ?? 0) > 0) {
    correctionsApplied.push(`archetype: growth-no-bonus → growth-immediate (bonus=${params.bonus.percentage}%)`);
    archetype = "growth-immediate";
  }
  if (archetype === "growth-vesting" && (params.bonus.vesting_years == null || params.bonus.vesting_years === 0)) {
    const v = params.surrender.years || 10;
    correctionsApplied.push(`bonus.vesting_years: null → ${v}`);
    params.bonus.vesting_years = v;
  }
  if (archetype === "growth-vesting" && params.bonus.type !== "vesting") {
    correctionsApplied.push(`bonus.type: ${params.bonus.type} → vesting`);
    params.bonus.type = "vesting";
  }
  if (archetype === "growth-immediate" && params.bonus.type !== "immediate") {
    correctionsApplied.push(`bonus.type: ${params.bonus.type} → immediate`);
    params.bonus.type = "immediate";
  }
  if (archetype === "growth-no-bonus" && params.bonus.type !== "none") {
    params.bonus.type = "none";
    params.bonus.percentage = 0;
  }
  if (archetype === "growth-phased" && (params.bonus.anniversary_rate == null || params.bonus.anniversary_years == null)) {
    correctionsApplied.push("growth-phased missing anniversary fields");
  }

  return { archetype, params, warnings, corrections: correctionsApplied };
}

async function research(query) {
  const start = Date.now();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 15 }],
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: `Research this fixed index annuity product and extract all parameters: "${query}"\n\nUse web search aggressively. Cross-reference at least 4 sources. Return the JSON output as specified.`,
      }],
    }],
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  const jsonStr = extractJson(text);
  if (!jsonStr) {
    return { error: "no JSON in response", elapsed, raw: text.slice(0, 500) };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { error: `JSON parse: ${e.message}`, elapsed, raw: jsonStr.slice(0, 500) };
  }
  if (!parsed.product_found) {
    return { found: false, elapsed, reason: parsed.reason };
  }
  const { archetype, params, corrections } = applyGuardrails(parsed);
  return {
    found: true,
    elapsed,
    carrier: parsed.carrier,
    product: parsed.carrier_product_name,
    suggested_name: parsed.suggested_generic_name,
    archetype_raw: parsed.archetype,
    archetype_final: archetype,
    engine_preset: ARCHETYPE_TO_ENGINE_PRESET[archetype],
    bonus_pct: params.bonus?.percentage,
    bonus_type: params.bonus?.type,
    vesting_years: params.bonus?.vesting_years,
    anniversary: params.bonus?.anniversary_rate ? `${params.bonus.anniversary_rate}% × ${params.bonus.anniversary_years}yr` : null,
    surrender_years: params.surrender?.years,
    surrender_schedule_len: params.surrender?.schedule?.length,
    rider_fee: params.fees?.annual_rider_fee,
    free_withdrawal: params.withdrawals?.penalty_free_percent,
    rop_year: params.other?.return_of_premium_year,
    income: params.income ? `${params.income.roll_up_rate}% ${params.income.roll_up_type}${params.income.roll_up_split_rate ? " split" : " flat"}` : null,
    sources: parsed.sources?.length ?? 0,
    warnings: parsed.warnings?.length ?? 0,
    corrections,
    expected: parsed._expected, // not from AI, set by test runner below
  };
}

const TEST_CASES = [
  { query: "Athene Performance Elite 7", expectedArchetype: "growth-immediate", expectedBonusGT: 0 },
  { query: "Athene Performance Elite Plus 15", expectedArchetype: "growth-vesting", expectedBonusGT: 15 },
  { query: "American Equity AssetShield 10", expectedArchetype: "growth-vesting", expectedBonusGT: 0 },
  { query: "Lincoln OptiBlend 7", expectedArchetype: "growth-no-bonus", expectedBonusEq: 0 },
  { query: "EquiTrust MarketEdge Bonus 5", expectedArchetype: "growth-phased", expectedBonusGT: 0 },
  { query: "American Equity IncomeShield 10", expectedArchetype: "income-simple-both", expectedBonusGT: 0 },
  { query: "Athene Ascent Pro 10 Bonus 2.0", expectedArchetypeOneOf: ["income-simple-base", "income-simple-both"] },
  { query: "Nationwide Peak 10", expectedCategory: "growth" },
];

const args = process.argv.slice(2);
const queries = args.length > 0 ? args.map(q => ({ query: q })) : TEST_CASES;

console.log(`\nRunning ${queries.length} test case(s)...\n`);

const results = [];
for (const tc of queries) {
  process.stdout.write(`▸ ${tc.query.padEnd(40)} ... `);
  try {
    const r = await research(tc.query);
    const pass =
      !r.error &&
      r.found &&
      (!tc.expectedArchetype || r.archetype_final === tc.expectedArchetype) &&
      (!tc.expectedArchetypeOneOf || tc.expectedArchetypeOneOf.includes(r.archetype_final)) &&
      (tc.expectedBonusGT == null || (r.bonus_pct ?? 0) > tc.expectedBonusGT) &&
      (tc.expectedBonusEq == null || r.bonus_pct === tc.expectedBonusEq) &&
      (!tc.expectedCategory || r.engine_preset);
    process.stdout.write(`${pass ? "✓" : "✗"} (${r.elapsed}s)\n`);
    results.push({ tc, r, pass });
  } catch (e) {
    process.stdout.write(`✗ ERROR: ${e.message}\n`);
    results.push({ tc, error: e.message, pass: false });
  }
}

console.log("\n=== DETAILED RESULTS ===\n");
for (const { tc, r, error, pass } of results) {
  console.log(`▸ ${tc.query} — ${pass ? "PASS" : "FAIL"}`);
  if (error) {
    console.log(`  ERROR: ${error}`);
    continue;
  }
  if (r.error) {
    console.log(`  ERROR: ${r.error}`);
    if (r.raw) console.log(`  RAW: ${r.raw}`);
    continue;
  }
  if (!r.found) {
    console.log(`  Product not found: ${r.reason}`);
    continue;
  }
  console.log(`  Carrier:           ${r.carrier}`);
  console.log(`  Product:           ${r.product}`);
  console.log(`  Suggested name:    ${r.suggested_name}`);
  console.log(`  Archetype (AI):    ${r.archetype_raw}`);
  if (r.archetype_raw !== r.archetype_final) {
    console.log(`  Archetype (final): ${r.archetype_final}  ← AUTO-CORRECTED`);
  }
  console.log(`  Engine preset:     ${r.engine_preset}`);
  console.log(`  Bonus:             ${r.bonus_pct}% (${r.bonus_type}${r.vesting_years ? `, vests ${r.vesting_years}yr` : ""}${r.anniversary ? `, +${r.anniversary}` : ""})`);
  console.log(`  Surrender:         ${r.surrender_years} yrs (schedule len ${r.surrender_schedule_len})`);
  console.log(`  Rider fee:         ${r.rider_fee}%`);
  console.log(`  Free WD:           ${r.free_withdrawal}%`);
  if (r.rop_year != null) console.log(`  Return of Premium: yr ${r.rop_year}`);
  if (r.income) console.log(`  Income roll-up:    ${r.income}`);
  console.log(`  Sources:           ${r.sources}, Warnings: ${r.warnings}`);
  if (r.corrections?.length) {
    console.log(`  Auto-corrections:`);
    r.corrections.forEach(c => console.log(`    - ${c}`));
  }
  if (tc.expectedArchetype && r.archetype_final !== tc.expectedArchetype) {
    console.log(`  ⚠ Expected archetype: ${tc.expectedArchetype}`);
  }
  console.log(`  Time: ${r.elapsed}s`);
  console.log("");
}

const passed = results.filter(r => r.pass).length;
console.log(`\n=== SUMMARY: ${passed}/${results.length} passed ===`);
