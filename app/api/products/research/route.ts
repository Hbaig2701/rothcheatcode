import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  ARCHETYPE_TO_ENGINE_PRESET,
  type ProductArchetype,
} from "@/lib/products/types";

export const dynamic = "force-dynamic";
export const maxDuration = 90; // Web search + extraction can take 30-60s

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const SYSTEM_PROMPT = `You are a product research assistant for a Roth conversion planning platform. Your job is to research fixed index annuity (FIA) products and extract their parameters for our calculation engine. ACCURACY MATTERS — every parameter is used in client illustrations. Errors mislead advisors and clients.

## Research Approach (REQUIRED)

1. ALWAYS use web search. Do not guess from prior knowledge.
2. PRIORITIZE the most CURRENT sources (within last 18 months). Insurance products evolve — bonuses change, surrender schedules shift, riders are added/removed. Use the current carrier .com page, current agent guide, or current third-party reviews (annuityeducator, annuityadvantage, wink) as your source of truth.
3. IGNORE old documents. If a source is dated more than 2 years ago AND a newer source contradicts it, USE THE NEWER SOURCE and do NOT mention the old one in warnings. Do not surface "the 2015 spec sheet says X but the 2025 sources say Y" — just use Y. The advisor only cares about today's product.
4. Cross-check key parameters (bonus %, surrender period, fees) across at least 2 current sources. If two CURRENT sources disagree, prefer the official carrier source and briefly flag the disagreement.
5. PREFER official carrier domains over third-party. If only third-party sources are available, that's fine — flag confidence as "assumed".
6. If you cannot find a parameter explicitly, set it to a reasonable default and mark its confidence as "assumed" or "not_found" — DO NOT silently make up a value with "verified" confidence.

## Warning Style (IMPORTANT)

When you add to the "warnings" array, write for a human advisor — not technical notes. Bad warning: "BONUS.PERCENTAGE: Official 2015 spec sheet shows 7% but 2026 third-party sources show 22%". Good warning: "Premium bonus may vary by state — confirmed at 22% in most states, but Indiana caps at 14% and Delaware at 15%."

DO:
- Write in plain English the advisor can act on
- Mention only what's actionable (state variations, missing data, ambiguity in current sources)
- Use everyday product terms ("free withdrawal", "premium bonus", "surrender charge") not field paths

DON'T:
- Reference outdated documents — they're irrelevant
- Use technical field paths (e.g., "bonus.percentage", "withdrawals.penalty_free_percent")
- Compare across versions of the product unless the advisor asked about a specific version
- Add warnings just to show your work — only add a warning if the advisor needs to verify or take action

## Archetype Decision Tree (FOLLOW EXACTLY)

ASK these questions IN ORDER for Growth products:

Q1: Does the product have a premium bonus? (Often called "premium bonus", "bonus", "additional credit", "first-year bonus".)
   → If 0% or not mentioned: archetype = growth-no-bonus. STOP.
   → If >0% premium bonus: continue to Q2.

Q2: Does the bonus have a vesting schedule (recaptured if you surrender early)?
   Look for: "vests over X years", "vesting schedule", "bonus recapture", "non-vested bonus", "vested bonus".
   → If YES (vesting/recapture mentioned): archetype = growth-vesting. STOP.
   → If NO (bonus is "fully credited at issue", "non-vesting", "no recapture", or only surrender-charge applies but no separate vesting schedule): continue to Q3.

Q3: Does the product credit ADDITIONAL anniversary bonuses (separate from the upfront premium bonus)?
   Look for: "anniversary bonus", "annual interest credit bonus", "premium bonus credited each year for N years".
   → If YES: archetype = growth-phased. STOP.
   → If NO: archetype = growth-immediate. STOP.

For Income products, ASK:

Q1: Is the roll-up SIMPLE interest or COMPOUND interest?
   → Simple → growth = principal × (1 + rate × years). Often described as "simple interest roll-up", "guaranteed simple roll-up rate".
   → Compound → growth = principal × (1 + rate)^years.

Q2: If COMPOUND, is there ONE rate for all years, or DIFFERENT rates for different year ranges?
   → One rate → income-compound-flat
   → Tiered (e.g., 7% years 1-5, 4% years 6-10) → income-compound-split

Q3: If SIMPLE, does the bonus apply to BOTH Account Value AND Income Base, or ONLY the Income Base?
   → Both → income-simple-both
   → Income Base only → income-simple-base

## Worked Examples (use these exact archetype mappings)

| Product | Archetype | Why |
|---|---|---|
| Athene Performance Elite 7 | growth-immediate | 5% upfront bonus, fully credited at issue, NOT vesting |
| Athene Performance Elite Plus 15 | growth-vesting | 22% bonus vests linearly over 15 years |
| Athene Ascent Pro 10 (growth side) | growth-immediate | 8% bonus, immediate |
| American Equity AssetShield 10 | growth-vesting | 10-14% vesting bonus over surrender period |
| Lincoln OptiBlend 7 | growth-no-bonus | No premium bonus, cap-rate growth only |
| EquiTrust MarketEdge Bonus | growth-phased | 8% upfront + 4% anniversary bonus years 1-3 |
| EquiTrust Market 7 (Bonus) | growth-vesting | Bonus vests over 7 years |
| Nationwide New Heights 9 | growth-no-bonus | No bonus, balanced allocation |
| American Equity IncomeShield 10 | income-simple-both | 14% bonus to BOTH AV + Income Base, 8.25% simple roll-up |
| EquiTrust MarketEarly Income | income-compound-split | 20% IB bonus, 7% compound yrs 1-5 / 4% yrs 6-10 |
| North American NAC BPA | income-compound-flat | 10% IB bonus, 8% compound flat |
| Athene Ascent Pro 10 Bonus 2.0 (income side) | income-simple-base | Simple roll-up, bonus on IB only |

## Hard Constraints (DO NOT VIOLATE)

- IMPOSSIBLE: bonus.percentage > 0 AND archetype = "growth-no-bonus" — these contradict. Pick growth-immediate / growth-vesting / growth-phased instead.
- IMPOSSIBLE: archetype = "growth-vesting" AND bonus.vesting_years is null — vesting requires a vesting period.
- IMPOSSIBLE: archetype = "growth-phased" AND (anniversary_rate is null OR anniversary_years is null) — phased requires both.
- REQUIRED: surrender.schedule MUST have exactly surrender.years entries.
- REQUIRED: category MUST match archetype prefix ("growth-*" → "growth", "income-*" → "income").
- DEFAULT rate_of_return: 7% for Growth products, 0% for Income products (income calc doesn't use rate_of_return).

## Vesting Schedule (CRITICAL)

When archetype = "growth-vesting", you MUST extract the actual year-by-year vesting percentage as an array, NOT assume linear.

Many carriers use STEPPED or CLIFF vesting schedules:
- Athene PE family typical: [0, 0, 0, 0, 0, 0, 20, 40, 60, 80, 100] — bonus is 0% vested for the first 6 years, then ramps up
- Some products use linear: [10, 20, 30, ..., 100] — vests evenly each year
- Cliff vest: [0, 0, ..., 0, 100] — 100% all at the end

Extract bonus.vesting_schedule as an array of numbers (length = bonus.vesting_years) representing the % of bonus owned at the END of each policy year. If you cannot find an explicit schedule, set vesting_schedule to "linear" (the literal string) and add a warning.

## State-Specific Variations (CRITICAL for accuracy)

FIA bonuses, surrender schedules, and vesting schedules OFTEN vary by state. Athene, American Equity, Allianz, etc. typically have 2-4 state groups with different rates. You MUST capture these variations.

Use the parameters.state_availability object:

state_availability: {
  "not_available": ["NY", ...],                       // states where the PRODUCT ITSELF is not sold (see strict rule below)
  "bonus_overrides": { "CA": 16, "FL": 19, ... },     // state code → bonus % (decimal not implied; 16 means 16%)
  "age_overrides": { "FL": 78, ... },                 // state code → max issue age
  "mva_overrides": { "MD": false, "MO": false },      // state code → MVA flag (false = MVA does NOT apply in this state)
  "surrender_overrides": {                            // state code → full surrender schedule array
    "CA": [8.2, 7.7, 6.6, 5.6, 4.5, 3.4, 2.3, 1.2, 0.1, 0],
    "FL": [10, 10, 10, 10, 9, 8, 7, 6, 5, 4]
  },
  "vesting_overrides": {                              // state code → full vesting schedule array
    "CA": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    "AK": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
  },
  "min_premium_overrides": { "AK": 5000, "CT": 5000 },// state code → minimum premium
  "confidence": "verified" | "partial" | "assumed"
}

### CRITICAL — multi-chart brochures (use chart_state_groups)

Many FIA brochures (Athene, American Equity, Allianz, etc.) have MULTIPLE STATE-GROUP CHARTS — labeled "Chart A", "Chart B", "Chart C", "Chart D" or by explicit state lists. Each chart has its own surrender schedule, vesting schedule, and sometimes its own bonus tier.

When the brochure has multiple charts, you MUST output a top-level chart_state_groups field listing EVERY chart with its EXPLICIT state list and values. The server will then deterministically pick the largest chart as the default and construct overrides — DO NOT make this judgment yourself.

Schema:

"chart_state_groups": [
  {
    "name": "Chart A",
    "states": ["AL", "AZ", "AR", ...],   // every state assigned to this chart
    "surrender_schedule": [12, 12, 12, 11, 10, 9, 8, 7, 6, 4],
    "vesting_schedule": [0, 0, 0, 0, 0, 0, 20, 40, 60, 80],
    "bonus_percentage": 22                // for the variant you're extracting (e.g., Plus)
  },
  {
    "name": "Chart B",
    "states": ["AK", "CT", "DE", ...],
    "surrender_schedule": [8.3, 8.0, 7.1, 6.2, 5.3, 4.4, 3.5, 2.6, 1.6, 0.9],
    "vesting_schedule": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    "bonus_percentage": 20
  },
  ...
]

Rules:
1. Every state assigned to any chart in the brochure MUST appear in exactly one states array.
2. If a chart only varies one dimension (e.g., only surrender, not vesting or bonus), copy the default chart's values for the unchanged dimensions.
3. Don't omit charts because they only apply to 1-2 states (e.g., CA-only chart). Include all of them.
4. If the brochure does NOT have multiple charts, OMIT chart_state_groups entirely and just fill parameters.surrender / parameters.bonus normally.

When chart_state_groups is provided, the server will:
- Pick the chart with the LARGEST state count as the default (parameters.surrender.schedule, bonus.vesting_schedule, bonus.percentage all get its values)
- Add every state from EVERY OTHER chart to surrender_overrides / vesting_overrides / bonus_overrides with that chart's values

So you don't need to populate parameters.surrender.schedule, bonus.vesting_schedule, bonus.percentage, or state_availability.{surrender,vesting,bonus}_overrides yourself when chart_state_groups is provided — the server constructs them. (Other state_availability fields like not_available, age_overrides, mva_overrides, min_premium_overrides still need to be populated normally.)

### Worked example — Athene Performance Elite 10

Brochure has 4 charts. The correct chart_state_groups output is:

[
  {
    "name": "Chart A",
    "states": ["AL", "AZ", "AR", "CO", "DC", "GA", "HI", "IL", "IN", "IA", "KS", "KY", "MA", "ME", "MI", "MO", "MS", "MT", "NE", "NH", "NM", "NC", "ND", "RI", "SD", "TN", "VT", "VA", "WV", "WI", "WY"],  // 31 states (FL ages 0-64 handled separately if needed)
    "surrender_schedule": [12, 12, 12, 11, 10, 9, 8, 7, 6, 4],
    "vesting_schedule": [0, 0, 0, 0, 0, 0, 20, 40, 60, 80],
    "bonus_percentage": 22
  },
  {
    "name": "Chart B",
    "states": ["AK", "CT", "DE", "ID", "LA", "MN", "NJ", "NV", "OH", "OK", "OR", "PA", "SC", "TX", "UT", "WA"],  // 16 states
    "surrender_schedule": [8.3, 8.0, 7.1, 6.2, 5.3, 4.4, 3.5, 2.6, 1.6, 0.9],
    "vesting_schedule": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
    "bonus_percentage": 20
  },
  {
    "name": "Chart C",
    "states": ["FL", "MD"],
    "surrender_schedule": [10, 10, 10, 10, 9, 8, 7, 6, 5, 4],
    "vesting_schedule": [0, 0, 0, 0, 0, 0, 20, 40, 60, 80],
    "bonus_percentage": 20
  },
  {
    "name": "Chart D",
    "states": ["CA"],
    "surrender_schedule": [8.2, 7.7, 6.6, 5.6, 4.5, 3.4, 2.3, 1.2, 0.1, 0],
    "vesting_schedule": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    "bonus_percentage": 19
  }
]

Server picks Chart A (31 states) as default. The other 19 states (Chart B's 16 + Chart C's 2 + Chart D's 1) get overrides automatically.

### CRITICAL — not_available is for PRODUCT unavailability, not feature exclusions

Only add a state to not_available if the brochure or state-availability map EXPLICITLY shows the PRODUCT ITSELF is not sold there. The state-availability map is the source of truth — gray/unhighlighted states on the map are not_available; everything else is available.

DO NOT mark a state as not_available based on:
- Confinement Waiver not available in that state
- Terminal Illness Waiver not available in that state
- MVA not applicable in that state
- Enhanced Income Benefit / Annuitization / Return of Premium feature exclusions
- Two-year strategies not available in that state
- Any other partial-feature exclusion

Those go into mva_overrides or get noted in warnings — NEVER not_available. The product is still sold there with reduced features. Marking it not_available means an advisor can't pick it for clients in that state at all, which is wrong.

When in doubt, leave the state OUT of not_available and add a warning instead.

## Variants (Base / Plus / etc.)

Some products have multiple variants in the same brochure (e.g., Athene Performance Elite Base vs Plus). The variants differ in fees, bonus rate, free withdrawal, and rider features. Pick ONE variant — the most common/featured one — and extract its parameters. Add a warning describing the other variant(s) so the advisor can save them as separate products if needed.

## Modifier Flags (add to any archetype if present)

- has_annual_fee — fees.annual_rider_fee > 0
- has_return_of_premium — surrender value floored at premium after some year
- has_enhanced_income — chronic illness / nursing home benefit multiplier
- has_cumulative_withdrawal — unused free withdrawal accumulates (often 20% cap)
- has_mva — Market Value Adjustment applies on early surrender

## Output Format

Respond with ONE JSON object enclosed in <json>...</json> tags. No prose outside the tags. Structure:

<json>
{
  "product_found": true,
  "carrier": "Athene Annuity & Life Company",
  "carrier_product_name": "Performance Elite Plus 15",
  "suggested_generic_name": "High-Bonus Vesting Growth",
  "category": "growth",
  "archetype": "growth-vesting",
  "modifier_flags": ["has_annual_fee", "has_return_of_premium", "has_cumulative_withdrawal", "has_mva"],
  "parameters": {
    "bonus": {
      "percentage": 22,
      "type": "vesting",
      "vesting_years": 15,
      "vesting_schedule": "linear",
      "anniversary_rate": null,
      "anniversary_years": null,
      "applies_to": null,
      "confidence": "verified"
    },
    "surrender": {
      "years": 15,
      "schedule": [15, 14, 14, 13, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 0],
      "confidence": "verified"
    },
    "fees": {
      "annual_rider_fee": 0.95,
      "fee_duration": "surrender_period",
      "confidence": "verified"
    },
    "withdrawals": {
      "penalty_free_percent": 10,
      "year_1_rule": "same",
      "year_1_custom_percent": null,
      "cumulative_withdrawal": true,
      "cumulative_percent": 20,
      "confidence": "verified"
    },
    "income": null,
    "other": {
      "mva_applies": true,
      "return_of_premium_year": 4,
      "min_premium": 10000,
      "max_premium": null,
      "min_issue_age": 0,
      "max_issue_age": 80,
      "confidence": "verified"
    },
    "state_availability": {
      "not_available": ["NY"],
      "age_overrides": {"FL": 78, "MD": 50},
      "mva_overrides": {"MD": false, "MO": false},
      "min_premium_overrides": {"AK": 5000, "CT": 5000, "DE": 5000, "ID": 5000, "IL": 5000, "LA": 5000, "MN": 5000, "MO": 5000, "MT": 5000, "NC": 5000, "NH": 5000, "NJ": 5000, "NV": 5000, "OH": 5000, "OK": 5000, "OR": 5000, "PA": 5000, "RI": 5000, "TX": 5000, "UT": 5000, "VA": 5000, "VT": 5000, "WA": 5000},
      "confidence": "verified"
    },
    "chart_state_groups": [
      {
        "name": "Chart A",
        "states": ["AL", "AZ", "AR", "CO", "DC", "GA", "HI", "IL", "IN", "IA", "KS", "KY", "MA", "ME", "MI", "MO", "MS", "MT", "NE", "NH", "NM", "NC", "ND", "RI", "SD", "TN", "VT", "VA", "WV", "WI", "WY"],
        "surrender_schedule": [12, 12, 12, 11, 10, 9, 8, 7, 6, 4],
        "vesting_schedule": [0, 0, 0, 0, 0, 0, 20, 40, 60, 80],
        "bonus_percentage": 22
      },
      {
        "name": "Chart B",
        "states": ["AK", "CT", "DE", "ID", "LA", "MN", "NJ", "NV", "OH", "OK", "OR", "PA", "SC", "TX", "UT", "WA"],
        "surrender_schedule": [8.3, 8.0, 7.1, 6.2, 5.3, 4.4, 3.5, 2.6, 1.6, 0.9],
        "vesting_schedule": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
        "bonus_percentage": 20
      }
    ],
    "form_defaults": {
      "rate_of_return": 7
    }
  },
  "sources": [
    {"url": "https://athene.com/products/...", "type": "official"},
    {"url": "https://annuityeducator.com/...", "type": "third_party"}
  ],
  "warnings": [
    {
      "field": "vesting_schedule",
      "message": "Document says 'vests over 15 years' but doesn't specify schedule. Assumed linear.",
      "resolution": "assumed"
    }
  ],
  "unsupported_features": []
}
</json>

For income products, populate the income object instead of leaving null:

"income": {
  "roll_up_type": "simple",
  "roll_up_rate": 8.25,
  "roll_up_split_rate": false,
  "roll_up_rate_years_1_5": null,
  "roll_up_rate_years_6_10": null,
  "roll_up_max_years": 10,
  "bonus_applies_to": "both",
  "payout_factors": {
    "single": {"55": 5.60, "60": 6.10, "65": 6.60, "70": 7.10, "75": 7.60, "80": 8.10},
    "joint":  {"55": 4.60, "60": 5.10, "65": 5.60, "70": 6.10, "75": 6.60, "80": 7.10}
  },
  "payout_increment_per_year": 0.10,
  "enhanced_income": null,
  "confidence": "verified"
}

## Rules

1. ALWAYS use web search to find official carrier information (carrier website, agent guides, spec sheets).
2. Cross-reference multiple sources when possible. Prefer official carrier sources over third-party reviews.
3. For each parameter section, set a confidence level: "verified" (multiple sources agree), "assumed" (inferred or one source), "partial" (some fields found, others missing), or "not_found" (couldn't extract).
4. If you can't find a value, set it to null and add a warning.
5. surrender.schedule MUST have exactly surrender.years entries.
6. Flag any features that don't fit our archetypes in unsupported_features.
7. If the product cannot be found at all, respond with: <json>{"product_found": false, "reason": "..."}</json>
8. The suggested_generic_name should DESCRIBE the product (e.g., "High-Bonus Vesting Growth", "Compound Roll-up Income"). Don't include the carrier name — that's stored separately.
9. category MUST be "growth" or "income" and MUST match the archetype prefix.
10. Be conservative — better to flag uncertainty than assume incorrectly.

Respond with the JSON only. Do not include any preamble or explanation outside the <json>...</json> tags.`;

interface ResearchInput {
  method: "search" | "document";
  query?: string;
  document?: { base64: string; name: string };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ResearchInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.method !== "search" && body.method !== "document") {
    return NextResponse.json({ error: "method must be 'search' or 'document'" }, { status: 400 });
  }
  if (body.method === "search" && !body.query?.trim()) {
    return NextResponse.json({ error: "query is required for search method" }, { status: 400 });
  }
  if (body.method === "document" && (!body.document?.base64 || !body.document?.name)) {
    return NextResponse.json({ error: "document.base64 and document.name are required" }, { status: 400 });
  }

  let anthropic: Anthropic;
  try {
    anthropic = getAnthropic();
  } catch (e) {
    console.error("[POST /api/products/research] Anthropic init failed:", e);
    return NextResponse.json(
      {
        product_found: false,
        error: "AI research is not configured. ANTHROPIC_API_KEY is missing in this environment.",
      },
      { status: 503 }
    );
  }

  // Build user message
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

  const userContent: ContentBlock[] = [];
  if (body.method === "document" && body.document) {
    userContent.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: body.document.base64,
      },
    });
    userContent.push({
      type: "text",
      text: `Extract all product parameters from this document (filename: ${body.document.name}). Then use web search to cross-reference and fill in any gaps. Return the JSON output as specified.`,
    });
  } else {
    userContent.push({
      type: "text",
      text: `Research this fixed index annuity product and extract all parameters: "${body.query}"

Use web search to find official carrier information, spec sheets, and agent guides. Cross-reference multiple sources. Return the JSON output as specified.`,
    });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 5000,
      // System prompt is identical across calls — cache it ($3/M write, $0.30/M read)
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: "ephemeral" } as any,
        },
      ],
      // max_uses: 6 strikes a balance — enough to hit 2-3 official sources + 2-3 third-party
      // confirmations without bloating input context with redundant pages.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 } as any],
      messages: [{ role: "user", content: userContent as never }],
    });

    // Extract text from final assistant message
    const text = response.content
      .filter((block) => block.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join("\n");

    // Parse JSON from <json>...</json> tags (or fallback to first { ... } match)
    const jsonStr = extractJson(text);
    if (!jsonStr) {
      console.error("[products/research] No JSON found in response. Raw text:", text.slice(0, 1000));
      return NextResponse.json(
        {
          product_found: false,
          error: "AI response did not contain a parseable result. Try using the manual builder.",
        },
        { status: 502 }
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error("[products/research] JSON parse failed:", e, "raw:", jsonStr.slice(0, 1000));
      return NextResponse.json(
        {
          product_found: false,
          error: "Failed to parse AI response. Try the manual builder.",
        },
        { status: 502 }
      );
    }

    // If product not found, return as-is
    if (!parsed.product_found) {
      return NextResponse.json({
        product_found: false,
        error: (parsed.reason as string) ?? "Product could not be identified. Try a more specific name or upload a brochure.",
      });
    }

    // Normalize output to match our query hook contract
    let archetype = parsed.archetype as ProductArchetype | undefined;
    const category =
      (parsed.category as string | undefined) ??
      (archetype?.startsWith("growth-") ? "growth" : "income");

    if (!archetype) {
      return NextResponse.json({
        product_found: false,
        error: `AI did not return an archetype. Try a more specific product name or use the manual builder.`,
      });
    }

    // Normalize parameters with safe defaults so the renderer never crashes on missing fields
    const rawParams = (parsed.parameters as Record<string, unknown>) ?? {};
    const params = normalizeConfigPayload(rawParams, category as "growth" | "income");
    const warnings = Array.isArray(parsed.warnings)
      ? (parsed.warnings as Array<Record<string, unknown>>)
      : [];

    // ---------- chart_state_groups: deterministic default + override construction ----------
    // When the brochure has multi-state charts (Athene Performance Elite, etc.),
    // the AI is unreliable about which chart is "most common" — it sometimes
    // picks a smaller chart and silently leaves the larger chart's states using
    // the wrong default. So if the AI provided a chart_state_groups list, we
    // ignore whatever it put in surrender.schedule / bonus.vesting_schedule /
    // bonus.percentage / surrender_overrides / vesting_overrides / bonus_overrides
    // and reconstruct from chart_state_groups directly.
    const rawGroups = (rawParams.chart_state_groups as Array<Record<string, unknown>> | undefined) ?? [];
    if (Array.isArray(rawGroups) && rawGroups.length >= 2) {
      const groups = rawGroups
        .map((g) => ({
          name: typeof g.name === "string" ? g.name : "Unnamed",
          states: Array.isArray(g.states) ? (g.states as string[]).map((s) => s.toUpperCase()) : [],
          surrender_schedule: Array.isArray(g.surrender_schedule) ? (g.surrender_schedule as number[]) : null,
          vesting_schedule: Array.isArray(g.vesting_schedule) ? (g.vesting_schedule as number[]) : null,
          bonus_percentage: typeof g.bonus_percentage === "number" ? g.bonus_percentage : null,
        }))
        .filter((g) => g.states.length > 0);

      if (groups.length >= 2) {
        // Pick the chart with the most states as default
        const defaultGroup = [...groups].sort((a, b) => b.states.length - a.states.length)[0];
        const otherGroups = groups.filter((g) => g.name !== defaultGroup.name);

        // Set defaults from the largest chart
        if (defaultGroup.surrender_schedule) {
          params.surrender.schedule = defaultGroup.surrender_schedule;
          params.surrender.years = defaultGroup.surrender_schedule.length;
        }
        if (defaultGroup.vesting_schedule) {
          (params.bonus as Record<string, unknown>).vesting_schedule = defaultGroup.vesting_schedule;
          params.bonus.vesting_years = defaultGroup.vesting_schedule.length;
        }
        if (defaultGroup.bonus_percentage != null) {
          params.bonus.percentage = defaultGroup.bonus_percentage;
        }

        // Reconstruct overrides from the other charts. Fallback object MUST
        // include every field the createCustomProductSchema marks as required
        // on stateAvailabilitySchema (not_available, bonus_overrides,
        // age_overrides). Previously the fallback only had not_available +
        // confidence, so when chart_state_groups fired AND the AI hadn't
        // returned its own state_availability, the resulting object was
        // missing age_overrides → save POST returned 400 "Validation Failed"
        // (Daniel F., ticket 07d8602d).
        const sa = (params.state_availability as Record<string, unknown> | null) ?? {
          not_available: [],
          bonus_overrides: {},
          age_overrides: {},
          confidence: "verified" as const,
        };
        params.state_availability = sa;
        const surrenderOverrides: Record<string, number[]> = {};
        const vestingOverrides: Record<string, number[]> = {};
        const bonusOverrides: Record<string, number> = {};

        for (const g of otherGroups) {
          for (const state of g.states) {
            if (g.surrender_schedule && JSON.stringify(g.surrender_schedule) !== JSON.stringify(defaultGroup.surrender_schedule)) {
              surrenderOverrides[state] = g.surrender_schedule;
            }
            if (g.vesting_schedule && JSON.stringify(g.vesting_schedule) !== JSON.stringify(defaultGroup.vesting_schedule)) {
              vestingOverrides[state] = g.vesting_schedule;
            }
            if (g.bonus_percentage != null && g.bonus_percentage !== defaultGroup.bonus_percentage) {
              bonusOverrides[state] = g.bonus_percentage;
            }
          }
        }

        // Merge with any existing overrides the AI populated (for fields not in chart_state_groups)
        const existingSurrender = (sa.surrender_overrides as Record<string, number[]> | undefined) ?? {};
        const existingVesting = (sa.vesting_overrides as Record<string, number[]> | undefined) ?? {};
        const existingBonus = (sa.bonus_overrides as Record<string, number> | undefined) ?? {};

        sa.surrender_overrides = Object.keys(surrenderOverrides).length > 0
          ? { ...existingSurrender, ...surrenderOverrides }
          : existingSurrender;
        sa.vesting_overrides = Object.keys(vestingOverrides).length > 0
          ? { ...existingVesting, ...vestingOverrides }
          : existingVesting;
        sa.bonus_overrides = Object.keys(bonusOverrides).length > 0
          ? { ...existingBonus, ...bonusOverrides }
          : existingBonus;

        warnings.push({
          field: "chart_state_groups",
          message: `Brochure has ${groups.length} state-group charts. Using ${defaultGroup.name} (${defaultGroup.states.length} states) as default; ${otherGroups.reduce((s, g) => s + g.states.length, 0)} states across other charts moved to overrides.`,
          resolution: "assumed",
        });
      }
    }

    // ---------- GUARDRAILS: auto-correct AI contradictions ----------

    // 1. bonus > 0 but archetype = no-bonus → flip to growth-immediate (most permissive)
    if (archetype === "growth-no-bonus" && params.bonus.percentage > 0) {
      const oldArchetype = archetype;
      archetype = "growth-immediate";
      warnings.push({
        field: "archetype",
        message: `AI matched to ${oldArchetype} but bonus.percentage is ${params.bonus.percentage}%. Auto-corrected to growth-immediate.`,
        resolution: "assumed",
      });
    }

    // 2. growth-vesting requires vesting_years
    if (archetype === "growth-vesting" && (params.bonus.vesting_years == null || params.bonus.vesting_years === 0)) {
      params.bonus.vesting_years = params.surrender.years || 10;
      warnings.push({
        field: "bonus.vesting_years",
        message: `Vesting period not specified. Defaulted to surrender period (${params.bonus.vesting_years} years).`,
        resolution: "assumed",
      });
    }

    // 3. growth-vesting bonus.type should be "vesting"
    if (archetype === "growth-vesting" && params.bonus.type !== "vesting") {
      params.bonus.type = "vesting";
    }

    // 4. growth-immediate bonus.type should be "immediate"
    if (archetype === "growth-immediate" && params.bonus.type !== "immediate") {
      params.bonus.type = "immediate";
    }

    // 5. growth-no-bonus bonus.type should be "none"
    if (archetype === "growth-no-bonus" && params.bonus.type !== "none") {
      params.bonus.type = "none";
      params.bonus.percentage = 0;
    }

    // 6. growth-phased requires anniversary_rate AND anniversary_years
    if (archetype === "growth-phased") {
      if (params.bonus.anniversary_rate == null || params.bonus.anniversary_years == null) {
        warnings.push({
          field: "bonus.anniversary",
          message: `Phased archetype but anniversary bonus details are missing. Set them on the next screen.`,
          resolution: "not_found",
        });
      }
      if (params.bonus.type !== "phased") params.bonus.type = "phased";
    }

    // 7. Sanity-pad surrender.schedule to match years
    if (params.surrender.schedule.length !== params.surrender.years) {
      const original = params.surrender.schedule.length;
      const padded = params.surrender.schedule.slice(0, params.surrender.years);
      while (padded.length < params.surrender.years) padded.push(0);
      params.surrender.schedule = padded;
      warnings.push({
        field: "surrender.schedule",
        message: `Surrender schedule had ${original} entries but surrender period is ${params.surrender.years} years. Adjusted to match.`,
        resolution: "assumed",
      });
    }

    // 7b. Validate per-state surrender overrides match the same length
    const surrenderOverrides = (params.state_availability as Record<string, unknown> | null)?.surrender_overrides as Record<string, number[]> | undefined;
    if (surrenderOverrides) {
      for (const [st, sched] of Object.entries(surrenderOverrides)) {
        if (sched.length !== params.surrender.years) {
          const padded = sched.slice(0, params.surrender.years);
          while (padded.length < params.surrender.years) padded.push(0);
          surrenderOverrides[st] = padded;
        }
      }
    }
    // 7c. Validate per-state vesting overrides match vesting_years (or surrender years as fallback)
    const vestingTargetYears = (params.bonus.vesting_years as number) || params.surrender.years;
    const vestingOverrides = (params.state_availability as Record<string, unknown> | null)?.vesting_overrides as Record<string, number[]> | undefined;
    if (vestingOverrides && vestingTargetYears > 0) {
      for (const [st, sched] of Object.entries(vestingOverrides)) {
        if (sched.length !== vestingTargetYears) {
          const padded = sched.slice(0, vestingTargetYears);
          while (padded.length < vestingTargetYears) padded.push(0);
          vestingOverrides[st] = padded;
        }
      }
    }
    // 7e. Strip "not_available" entries that are also in any override map.
    // If a state appears in surrender_overrides / vesting_overrides / bonus_overrides,
    // by definition the product IS available there with different terms — so it
    // can't logically be in not_available. AI sometimes confuses waiver/MVA/feature
    // exclusions ("Confinement Waiver not available in MA") with the product
    // itself being unavailable.
    const stateAvail = params.state_availability as Record<string, unknown> | null | undefined;
    if (stateAvail) {
      const notAvail = (stateAvail.not_available as string[] | undefined) ?? [];
      if (notAvail.length > 0) {
        const overrideStates = new Set<string>([
          ...Object.keys((stateAvail.surrender_overrides as Record<string, unknown> | undefined) ?? {}),
          ...Object.keys((stateAvail.vesting_overrides as Record<string, unknown> | undefined) ?? {}),
          ...Object.keys((stateAvail.bonus_overrides as Record<string, unknown> | undefined) ?? {}),
          ...Object.keys((stateAvail.age_overrides as Record<string, unknown> | undefined) ?? {}),
          ...Object.keys((stateAvail.mva_overrides as Record<string, unknown> | undefined) ?? {}),
        ]);
        const stripped = notAvail.filter((s) => !overrideStates.has(s));
        if (stripped.length !== notAvail.length) {
          const removed = notAvail.filter((s) => overrideStates.has(s));
          stateAvail.not_available = stripped;
          warnings.push({
            field: "state_availability.not_available",
            message: `Removed ${removed.join(", ")} from not_available — those states have feature/schedule overrides, meaning the product IS sold there with different terms. Auto-corrected.`,
            resolution: "assumed",
          });
        }
      }
    }

    // 7f. If the AI picked a chart as default but more states share a single
    // override schedule than use the default, swap them. AI sometimes picks
    // the "wrong" chart as default (e.g., picks Chart B with 16 states when
    // Chart A applies to 32 states). Auto-correct so the default actually
    // applies to the most states by raw count.
    const totalStatesIncDC = 51;
    const swapDefaultToLargestGroup = (
      defaultSchedule: number[] | string,
      overrideMap: Record<string, number[] | string> | undefined,
      label: string
    ): { newDefault: number[] | string; statesToMoveToOverrides: string[] } | null => {
      if (!overrideMap || Object.keys(overrideMap).length === 0) return null;
      // Group states by their schedule fingerprint (stringified)
      const groups = new Map<string, string[]>();
      for (const [state, sched] of Object.entries(overrideMap)) {
        const key = JSON.stringify(sched);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(state);
      }
      // Compute default-applies-to count = total - not_available - states in any override
      const naCount = ((stateAvail?.not_available as string[] | undefined) ?? []).length;
      const overrideStateCount = Object.keys(overrideMap).length;
      const defaultCount = totalStatesIncDC - naCount - overrideStateCount;
      // Find the override group with the largest state count
      let maxGroupKey: string | null = null;
      let maxGroupCount = 0;
      for (const [key, states] of groups) {
        if (states.length > maxGroupCount) {
          maxGroupCount = states.length;
          maxGroupKey = key;
        }
      }
      if (!maxGroupKey || maxGroupCount <= defaultCount) return null;
      // Swap: the largest override group becomes the new default; the old
      // default applies to the states currently using that group's schedule;
      // the rest of the override map stays as-is.
      const newDefault = JSON.parse(maxGroupKey) as number[] | string;
      const statesToMoveToOverrides = groups.get(maxGroupKey)!;
      // Remove the max group from the override map
      for (const s of statesToMoveToOverrides) delete overrideMap[s];
      warnings.push({
        field: `state_availability.${label}`,
        message: `AI picked a default ${label} that applied to only ~${defaultCount} states; an override group covered ${maxGroupCount}. Swapped — the larger group is now the default.`,
        resolution: "assumed",
      });
      return { newDefault, statesToMoveToOverrides };
    };

    if (stateAvail) {
      // Surrender
      const surrSwap = swapDefaultToLargestGroup(
        params.surrender.schedule,
        stateAvail.surrender_overrides as Record<string, number[]> | undefined,
        "surrender_overrides"
      );
      if (surrSwap) {
        const oldDefault = params.surrender.schedule;
        params.surrender.schedule = surrSwap.newDefault as number[];
        // Move the old default into overrides for states that previously matched
        // the swapped-out group's schedule. We don't know those states by name
        // (they were the "default" set), but the user's State Variations panel
        // will simply show fewer states with overrides — which is fine.
        // Just ensure surrender_overrides no longer holds the new default's states.
        void oldDefault;
      }
      // Vesting
      const vestSwap = swapDefaultToLargestGroup(
        params.bonus.vesting_schedule as number[] | string,
        stateAvail.vesting_overrides as Record<string, number[]> | undefined,
        "vesting_overrides"
      );
      if (vestSwap) {
        (params.bonus as Record<string, unknown>).vesting_schedule = vestSwap.newDefault;
      }
      // Bonus % — same logic but values are scalars, not arrays
      const bonusOverrides = stateAvail.bonus_overrides as Record<string, number> | undefined;
      if (bonusOverrides && Object.keys(bonusOverrides).length > 0) {
        const groups = new Map<number, string[]>();
        for (const [state, pct] of Object.entries(bonusOverrides)) {
          if (!groups.has(pct)) groups.set(pct, []);
          groups.get(pct)!.push(state);
        }
        const naCount = ((stateAvail.not_available as string[] | undefined) ?? []).length;
        const defaultCount = totalStatesIncDC - naCount - Object.keys(bonusOverrides).length;
        let maxPct: number | null = null;
        let maxCount = 0;
        for (const [pct, states] of groups) {
          if (states.length > maxCount) {
            maxCount = states.length;
            maxPct = pct;
          }
        }
        if (maxPct != null && maxCount > defaultCount) {
          const oldDefault = params.bonus.percentage;
          params.bonus.percentage = maxPct;
          // Remove the new-default states from overrides
          for (const s of groups.get(maxPct)!) delete bonusOverrides[s];
          warnings.push({
            field: "state_availability.bonus_overrides",
            message: `AI picked default bonus ${oldDefault}% applying to only ~${defaultCount} states; an override group at ${maxPct}% covered ${maxCount}. Swapped — the larger group is now the default.`,
            resolution: "assumed",
          });
        }
      }
    }

    // 7d. Validate top-level vesting_schedule array length
    if (Array.isArray(params.bonus.vesting_schedule) && vestingTargetYears > 0) {
      const sched = params.bonus.vesting_schedule as number[];
      if (sched.length !== vestingTargetYears) {
        const padded = sched.slice(0, vestingTargetYears);
        while (padded.length < vestingTargetYears) padded.push(0);
        (params.bonus as Record<string, unknown>).vesting_schedule = padded;
      }
    }

    // 8. Category must match archetype prefix
    const expectedCategory = archetype.startsWith("growth-") ? "growth" : "income";
    if (category !== expectedCategory) {
      warnings.push({
        field: "category",
        message: `Category was "${category}" but archetype is "${archetype}". Corrected to "${expectedCategory}".`,
        resolution: "assumed",
      });
    }

    parsed.warnings = warnings;
    const finalCategory = expectedCategory;
    const enginePreset =
      archetype in ARCHETYPE_TO_ENGINE_PRESET
        ? ARCHETYPE_TO_ENGINE_PRESET[archetype]
        : null;

    if (!enginePreset) {
      return NextResponse.json({
        product_found: false,
        error: `AI returned an unrecognized archetype "${archetype}". Try a more specific product name or use the manual builder.`,
      });
    }

    return NextResponse.json({
      product_found: true,
      carrier: (parsed.carrier as string) ?? null,
      carrier_product_name: (parsed.carrier_product_name as string) ?? null,
      suggested_generic_name: (parsed.suggested_generic_name as string) ?? "Custom Product",
      category: finalCategory,
      archetype,
      engine_preset: enginePreset,
      modifier_flags: Array.isArray(parsed.modifier_flags) ? parsed.modifier_flags : [],
      parameters: params,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      unsupported_features: Array.isArray(parsed.unsupported_features) ? parsed.unsupported_features : [],
    });
  } catch (err) {
    console.error("[POST /api/products/research] Anthropic error:", err);
    const message = err instanceof Error ? err.message : "Research failed";

    // Detect web_search not enabled — surface friendly message
    const lower = message.toLowerCase();
    if (lower.includes("web_search") || lower.includes("tool not available") || lower.includes("not enabled")) {
      return NextResponse.json(
        {
          product_found: false,
          error:
            "Web search is not enabled on this Anthropic API key. Enable web_search at console.anthropic.com or use the manual builder.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { product_found: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * Normalize an AI-returned config payload into a complete ProductConfigPayload-shape object.
 * Fills in defaults for any missing nested fields so the UI renderer never throws on undefined.
 */
function normalizeConfigPayload(raw: Record<string, unknown>, category: "growth" | "income") {
  const obj = (key: string) => (raw[key] as Record<string, unknown> | undefined) ?? {};
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && !isNaN(v) ? v : fallback);
  const str = <T extends string>(v: unknown, fallback: T): T =>
    (typeof v === "string" ? (v as T) : fallback);
  const bool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);
  const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);

  const bonus = obj("bonus");
  const surrender = obj("surrender");
  const fees = obj("fees");
  const withdrawals = obj("withdrawals");
  const other = obj("other");
  const formDefaults = obj("form_defaults");
  const stateAvail = raw.state_availability as Record<string, unknown> | null | undefined;

  const surrenderYears = Math.max(0, Math.round(num(surrender.years, 10)));

  const result: Record<string, unknown> = {
    bonus: {
      percentage: num(bonus.percentage, 0),
      type: str(bonus.type, "none" as "vesting" | "immediate" | "phased" | "none"),
      vesting_years: bonus.vesting_years == null ? null : num(bonus.vesting_years),
      vesting_schedule: bonus.vesting_schedule ?? null,
      anniversary_rate: bonus.anniversary_rate == null ? null : num(bonus.anniversary_rate),
      anniversary_years: bonus.anniversary_years == null ? null : num(bonus.anniversary_years),
      applies_to: bonus.applies_to ?? null,
      confidence: str(bonus.confidence, "assumed" as const),
    },
    surrender: {
      years: surrenderYears,
      schedule: arr<number>(surrender.schedule, []),
      confidence: str(surrender.confidence, "assumed" as const),
    },
    fees: {
      annual_rider_fee: num(fees.annual_rider_fee, 0),
      fee_duration: fees.fee_duration ?? "surrender_period",
      confidence: str(fees.confidence, "assumed" as const),
    },
    withdrawals: {
      penalty_free_percent: num(withdrawals.penalty_free_percent, 10),
      year_1_rule: str(withdrawals.year_1_rule, "same" as "same" | "interest_only" | "custom"),
      year_1_custom_percent: withdrawals.year_1_custom_percent == null ? null : num(withdrawals.year_1_custom_percent),
      cumulative_withdrawal: bool(withdrawals.cumulative_withdrawal, false),
      cumulative_percent: withdrawals.cumulative_percent == null ? null : num(withdrawals.cumulative_percent),
      confidence: str(withdrawals.confidence, "assumed" as const),
    },
    other: {
      mva_applies: bool(other.mva_applies, false),
      return_of_premium_year: other.return_of_premium_year == null ? null : num(other.return_of_premium_year),
      min_premium: other.min_premium == null ? null : num(other.min_premium),
      max_premium: other.max_premium == null ? null : num(other.max_premium),
      min_issue_age: other.min_issue_age == null ? null : num(other.min_issue_age),
      max_issue_age: other.max_issue_age == null ? null : num(other.max_issue_age),
      confidence: str(other.confidence, "assumed" as const),
    },
    state_availability: stateAvail
      ? {
          not_available: arr<string>(stateAvail.not_available, []),
          bonus_overrides: (stateAvail.bonus_overrides as Record<string, number>) ?? {},
          age_overrides: (stateAvail.age_overrides as Record<string, number>) ?? {},
          mva_overrides: (stateAvail.mva_overrides as Record<string, boolean>) ?? undefined,
          surrender_overrides: (stateAvail.surrender_overrides as Record<string, number[]>) ?? undefined,
          vesting_overrides: (stateAvail.vesting_overrides as Record<string, number[]>) ?? undefined,
          min_premium_overrides: (stateAvail.min_premium_overrides as Record<string, number>) ?? undefined,
          confidence: str(stateAvail.confidence, "partial" as const),
        }
      : null,
    form_defaults: {
      rate_of_return: num(formDefaults.rate_of_return, category === "income" ? 0 : 7),
    },
  };

  if (category === "income") {
    const income = obj("income");
    const payouts = (income.payout_factors as Record<string, unknown>) ?? {};
    result.income = {
      roll_up_type: str(income.roll_up_type, "compound" as "simple" | "compound"),
      roll_up_rate: num(income.roll_up_rate, 0),
      roll_up_split_rate: bool(income.roll_up_split_rate, false),
      roll_up_rate_years_1_5: income.roll_up_rate_years_1_5 == null ? null : num(income.roll_up_rate_years_1_5),
      roll_up_rate_years_6_10: income.roll_up_rate_years_6_10 == null ? null : num(income.roll_up_rate_years_6_10),
      roll_up_max_years: num(income.roll_up_max_years, 10),
      bonus_applies_to: income.bonus_applies_to ?? null,
      payout_factors: {
        single: (payouts.single as Record<string, number>) ?? {},
        joint: (payouts.joint as Record<string, number>) ?? {},
      },
      payout_increment_per_year: num(income.payout_increment_per_year, 0.1),
      // Normalize enhanced_income defensively — like every other field here.
      // The AI sometimes surfaces a PARTIAL object (e.g. multipliers but no
      // `included`/`max_years`/`waiting_period`), which then failed save-time
      // validation ("expected boolean, received undefined") with no form
      // control to fix it (Zachariah Bryan / F&G Performance Pro ticket).
      // enhanced_income is stored metadata — the projection engine does not
      // consume it — so filling sensible defaults is calc-safe.
      enhanced_income: (() => {
        const ei = income.enhanced_income;
        if (ei == null || typeof ei !== "object") return null;
        const e = ei as Record<string, unknown>;
        return {
          included: bool(e.included, true),
          multiplier_single: num(e.multiplier_single, 2),
          multiplier_joint: num(e.multiplier_joint, 2),
          max_years: Math.max(0, Math.round(num(e.max_years, 5))),
          waiting_period: Math.max(0, Math.round(num(e.waiting_period, 0))),
        };
      })(),
      confidence: str(income.confidence, "assumed" as const),
    };
  } else {
    result.income = null;
  }

  return result as {
    bonus: { percentage: number; type: string; vesting_years: number | null; vesting_schedule: unknown; anniversary_rate: number | null; anniversary_years: number | null; applies_to: unknown; confidence: string };
    surrender: { years: number; schedule: number[]; confidence: string };
    fees: { annual_rider_fee: number; fee_duration: unknown; confidence: string };
    withdrawals: { penalty_free_percent: number; year_1_rule: string; year_1_custom_percent: number | null; cumulative_withdrawal: boolean; cumulative_percent: number | null; confidence: string };
    other: { mva_applies: boolean; return_of_premium_year: number | null; min_premium: number | null; max_premium: number | null; min_issue_age: number | null; max_issue_age: number | null; confidence: string };
    income: unknown;
    state_availability: unknown;
    form_defaults: { rate_of_return: number };
  };
}

/**
 * Extract JSON from text. Prefers <json>...</json> tags; falls back to first balanced { ... } block.
 */
function extractJson(text: string): string | null {
  const tagMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tagMatch) return tagMatch[1].trim();

  // Fallback — find first balanced JSON object
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === "\\" && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
