/**
 * Server-side tool definitions + handlers for the AI chat assistant.
 *
 * Tools are how the model pulls real client / projection data instead of
 * making up numbers. Each tool is defined twice:
 *   1. CHAT_TOOLS — the Anthropic-facing schema the model sees.
 *   2. runTool — the handler that actually executes against Supabase.
 *
 * RLS scopes every Supabase call to the signed-in advisor's own records,
 * so a malformed tool call can never leak another advisor's data.
 *
 * Each tool also exposes a `statusLabel` — short human-friendly text the
 * UI shows while the tool runs ("Looking up your client list…") so
 * advisors know something is happening during multi-second lookups.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifySlackNewTicket } from "@/lib/notifications/slack";
import type { SupportSeverity, SupportCategory } from "@/lib/types/support";

export interface ChatTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const CHAT_TOOLS: ChatTool[] = [
  {
    name: "get_my_clients",
    description:
      "List the signed-in advisor's clients with their headline configuration (name, age, account value, blueprint, conversion type). Use this when the advisor mentions a client by name and you don't know which client_id they mean, or when you need to enumerate their clients.",
    input_schema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description:
            "Optional name fragment to filter the client list. Case-insensitive substring match against the client's name.",
        },
      },
    },
  },
  {
    name: "get_client_details",
    description:
      "Fetch the detailed configuration of one client — filing status, state, IRA balance, social security, conversion settings, product type, end age, heir tax rate, etc. Use when the advisor asks 'what is X for [client]' or you need a setting to explain a number.",
    input_schema: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "UUID of the client. Get this from get_my_clients.",
        },
      },
      required: ["client_id"],
    },
  },
  {
    name: "get_projection_summary",
    description:
      "Fetch the headline projection numbers for a client: baseline vs strategy lifetime wealth, final account balances on each side, total conversion tax, total RMDs, IRMAA totals, heir tax. Year-by-year arrays are NOT included — call get_year_breakdown for a specific year.",
    input_schema: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "UUID of the client.",
        },
      },
      required: ["client_id"],
    },
  },
  {
    name: "get_year_breakdown",
    description:
      "Fetch one specific year from the projection for a client. Returns side-by-side baseline + strategy values for that year: income breakdown, taxes paid, RMD, conversion amount, account balances, bracket, IRMAA tier. Use for 'why is the 2028 conversion X?' style questions.",
    input_schema: {
      type: "object",
      properties: {
        client_id: {
          type: "string",
          description: "UUID of the client.",
        },
        year: {
          type: "integer",
          description: "Calendar year (e.g., 2028).",
        },
      },
      required: ["client_id", "year"],
    },
  },
  {
    name: "create_support_ticket",
    description:
      "File a support ticket on the advisor's behalf so the engineering team can investigate. ONLY call this AFTER the advisor has explicitly confirmed they want a ticket filed in this conversation. Never auto-file. Use for genuine bugs (math doesn't reconcile, label clearly wrong, feature broken) — NOT for clarification questions or feature wishes.",
    input_schema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description:
            "Short subject line, advisor-style. Example: 'Sprengel — Tax on RMDs column showing 0 in 2031'.",
        },
        description: {
          type: "string",
          description:
            "Detailed description of the issue. Include what the advisor observed, what they expected, the client name if applicable, and any specific year/number they cited.",
        },
        category: {
          type: "string",
          enum: ["bug", "data_issue", "feature_request", "question", "other"],
          description: "One of: bug, data_issue, feature_request, question, other.",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description:
            "low (cosmetic), medium (default — affects use), high (blocking), critical (data loss / wrong numbers being shown to clients).",
        },
        client_id: {
          type: "string",
          description:
            "Optional UUID of the affected client so support can pull up their data quickly.",
        },
      },
      required: ["subject", "description", "category"],
    },
  },
];

/**
 * Friendly status label shown in the UI while a tool runs. Falls back to
 * a generic message for unknown tool names so the UX never goes silent.
 */
export function getToolStatusLabel(toolName: string): string {
  switch (toolName) {
    case "get_my_clients":
      return "Looking through your clients";
    case "get_client_details":
      return "Reading client details";
    case "get_projection_summary":
      return "Pulling the projection";
    case "get_year_breakdown":
      return "Reading that year's numbers";
    case "create_support_ticket":
      return "Filing the support ticket";
    default:
      return "Looking something up";
  }
}

// Side-channel for the route to know which ticket (if any) was created
// during the agent loop, so the FINAL assistant message can be marked with
// created_ticket_id for the admin panel + UI affordance. The tool handler
// stashes the ticket id here on success.
interface ToolCallSideEffects {
  ticketId?: string;
}

interface ToolContext {
  // User-scoped Supabase client — RLS automatically restricts queries to
  // the advisor's own clients/projections. Don't use the admin client here.
  supabase: SupabaseClient;
  userId: string;
  // Output channel for tool-specific side effects (e.g., ticket id) so the
  // route can decorate the persisted assistant message after the loop ends.
  sideEffects: ToolCallSideEffects;
}

/**
 * Dispatch a tool call by name. Returns the tool_result content (a string
 * that the model will see as the tool's output). Errors are stringified
 * and returned with is_error semantics so the model can recover instead
 * of the whole loop crashing.
 */
export async function runTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ content: string; isError: boolean }> {
  try {
    switch (toolName) {
      case "get_my_clients":
        return { content: await runGetMyClients(input, ctx), isError: false };
      case "get_client_details":
        return { content: await runGetClientDetails(input, ctx), isError: false };
      case "get_projection_summary":
        return { content: await runGetProjectionSummary(input, ctx), isError: false };
      case "get_year_breakdown":
        return { content: await runGetYearBreakdown(input, ctx), isError: false };
      case "create_support_ticket":
        return { content: await runCreateSupportTicket(input, ctx), isError: false };
      default:
        return { content: `Unknown tool: ${toolName}`, isError: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Tool execution failed";
    return { content: msg, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function runGetMyClients(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const search = typeof input.search === "string" ? input.search.trim() : "";

  // Try a strict ilike substring match first. If that returns zero hits AND
  // a search was provided, fall back to returning the full client list so
  // the model can suggest the closest near-match by name similarity — e.g.,
  // "Travis Johns" → "did you mean Travis John?". Without this fallback,
  // a single-character typo dead-ends with "no client matches".
  const baseSelect =
    "id, name, age, filing_status, qualified_account_value, blueprint_type, conversion_type, updated_at";

  const buildQuery = (filter: string | null) => {
    let q = ctx.supabase
      .from("clients")
      .select(baseSelect)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (filter) q = q.ilike("name", `%${filter}%`);
    return q;
  };

  // Pass 1: filtered.
  let { data, error } = search
    ? await buildQuery(search)
    : await buildQuery(null);
  if (error) throw new Error(error.message);

  let fallbackNote: string | null = null;
  if (search && (!data || data.length === 0)) {
    const all = await buildQuery(null);
    if (all.error) throw new Error(all.error.message);
    data = all.data;
    fallbackNote =
      `No client name exactly matches "${search}". Returning the full client list — pick the closest match by name and confirm with the advisor before continuing ("Looks like you meant <NAME> — should I look them up?").`;
  }

  if (!data || data.length === 0) {
    return "No clients on this account yet.";
  }

  // Compact, model-friendly JSON. Dollar fields are returned in dollars
  // (not cents) so the model doesn't have to remember the cents convention.
  const result = {
    clients: data.map((c) => ({
      id: c.id,
      name: c.name,
      age: c.age,
      filing_status: c.filing_status,
      ira_balance_dollars: Math.round((c.qualified_account_value ?? 0) / 100),
      blueprint: c.blueprint_type,
      conversion_type: c.conversion_type,
      updated_at: c.updated_at,
    })),
    note: fallbackNote,
  };
  return JSON.stringify(result, null, 0);
}

async function runGetClientDetails(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const clientId = String(input.client_id ?? "");
  if (!clientId) throw new Error("client_id required");

  // The Supabase types parser only sees a literal string here, so the
  // column list stays on one line. Avoid .join(",") — that returns a wide
  // GenericStringError type at compile time.
  const { data, error } = await ctx.supabase
    .from("clients")
    .select(
      "id, name, age, spouse_name, spouse_age, filing_status, state, state_tax_rate, qualified_account_value, roth_ira, taxable_accounts, blueprint_type, custom_product_id, carrier_name, product_name, bonus_percent, rate_of_return, baseline_comparison_rate, conversion_type, fixed_conversion_amount, target_partial_amount, constraint_type, tax_rate, max_tax_rate, tax_payment_source, ssi_payout_age, ssi_annual_amount, spouse_ssi_payout_age, spouse_ssi_annual_amount, end_age, heir_tax_rate, widow_analysis, widow_death_age, rmd_treatment, aum_allocation_percent, respect_penalty_free_limit, penalty_free_scope, penalty_free_percent, surrender_years"
    )
    .eq("id", clientId)
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Client not found");

  // Cast to a generic record because the long-string select returns a
  // single-row shape the TS parser doesn't fully resolve; the runtime
  // shape matches the columns we listed above.
  const d = data as unknown as Record<string, unknown>;

  // Normalize cents → dollars for the model.
  const norm: Record<string, unknown> = {
    ...d,
    ira_balance_dollars: Math.round(((d.qualified_account_value as number | null) ?? 0) / 100),
    roth_balance_dollars: Math.round(((d.roth_ira as number | null) ?? 0) / 100),
    taxable_balance_dollars: Math.round(((d.taxable_accounts as number | null) ?? 0) / 100),
    ssi_annual_dollars: Math.round(((d.ssi_annual_amount as number | null) ?? 0) / 100),
    spouse_ssi_annual_dollars: Math.round(((d.spouse_ssi_annual_amount as number | null) ?? 0) / 100),
    fixed_conversion_dollars:
      d.fixed_conversion_amount != null
        ? Math.round((d.fixed_conversion_amount as number) / 100)
        : null,
    target_partial_dollars:
      d.target_partial_amount != null
        ? Math.round((d.target_partial_amount as number) / 100)
        : null,
  };
  // Drop the raw cents fields we just normalized so the model doesn't
  // double-count or get confused.
  delete norm.qualified_account_value;
  delete norm.roth_ira;
  delete norm.taxable_accounts;
  delete norm.ssi_annual_amount;
  delete norm.spouse_ssi_annual_amount;
  delete norm.fixed_conversion_amount;
  delete norm.target_partial_amount;

  return JSON.stringify(norm, null, 0);
}

async function runGetProjectionSummary(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const clientId = String(input.client_id ?? "");
  if (!clientId) throw new Error("client_id required");

  const { data: projectionRaw, error } = await ctx.supabase
    .from("projections")
    .select(
      "client_id, break_even_age, total_tax_savings, heir_benefit, baseline_final_traditional, baseline_final_roth, baseline_final_taxable, baseline_final_net_worth, blueprint_final_traditional, blueprint_final_roth, blueprint_final_taxable, blueprint_final_net_worth, strategy, projection_years"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) throw new Error(error.message);
  if (!projectionRaw) throw new Error("No projection yet — the report may need to be generated first.");

  const projection = projectionRaw as unknown as {
    break_even_age: number | null;
    total_tax_savings: number | null;
    heir_benefit: number | null;
    baseline_final_traditional: number;
    baseline_final_roth: number;
    baseline_final_taxable: number;
    baseline_final_net_worth: number;
    blueprint_final_traditional: number;
    blueprint_final_roth: number;
    blueprint_final_taxable: number;
    blueprint_final_net_worth: number;
    strategy: string;
    projection_years: number;
  };

  // Engine is in cents. Normalize to dollars + add roll-ups the dashboard
  // computes (Lifetime Tax Cost, Net Legacy).
  // Use the client's actual heir tax rate so the chat's Net Legacy / Lifetime
  // Wealth match the report (which uses client.heir_tax_rate). Hardcoding 40%
  // made the chat contradict the report for any client whose heir rate isn't
  // 40% — an advisor asking the assistant got a different legacy number than the
  // PDF (audit F9). Mirror the engine's resolution: heir_tax_rate, else parse
  // heir_bracket, else 40.
  const { data: clientHeir } = await ctx.supabase
    .from("clients")
    .select("heir_tax_rate, heir_bracket")
    .eq("id", clientId)
    .single();
  const heirRow = clientHeir as unknown as { heir_tax_rate: number | null; heir_bracket: string | null } | null;
  const heirRatePct = (heirRow?.heir_tax_rate && heirRow.heir_tax_rate > 0)
    ? heirRow.heir_tax_rate
    : (heirRow?.heir_bracket ? (parseInt(heirRow.heir_bracket, 10) || 40) : 40);
  const heirTaxRate = heirRatePct / 100;
  const baseHeirTax = Math.round(projection.baseline_final_traditional * heirTaxRate);
  const blueHeirTax = Math.round(projection.blueprint_final_traditional * heirTaxRate);
  const baseLifetimeWealth = projection.baseline_final_net_worth - baseHeirTax;
  const blueLifetimeWealth = projection.blueprint_final_net_worth - blueHeirTax;

  const summary = {
    strategy: projection.strategy,
    projection_years: projection.projection_years,
    baseline: {
      final_traditional_dollars: Math.round(projection.baseline_final_traditional / 100),
      final_roth_dollars: Math.round(projection.baseline_final_roth / 100),
      final_taxable_dollars: Math.round(projection.baseline_final_taxable / 100),
      final_net_worth_dollars: Math.round(projection.baseline_final_net_worth / 100),
      heir_tax_dollars: Math.round(baseHeirTax / 100),
      lifetime_wealth_dollars: Math.round(baseLifetimeWealth / 100),
    },
    strategy_outcome: {
      final_traditional_dollars: Math.round(projection.blueprint_final_traditional / 100),
      final_roth_dollars: Math.round(projection.blueprint_final_roth / 100),
      final_taxable_dollars: Math.round(projection.blueprint_final_taxable / 100),
      final_net_worth_dollars: Math.round(projection.blueprint_final_net_worth / 100),
      heir_tax_dollars: Math.round(blueHeirTax / 100),
      lifetime_wealth_dollars: Math.round(blueLifetimeWealth / 100),
    },
    advantage: {
      lifetime_wealth_delta_dollars: Math.round(
        (blueLifetimeWealth - baseLifetimeWealth) / 100
      ),
      tax_savings_dollars: Math.round((projection.total_tax_savings ?? 0) / 100),
      heir_benefit_dollars: Math.round((projection.heir_benefit ?? 0) / 100),
      break_even_age: projection.break_even_age,
    },
    note:
      "Heir tax assumed 40% — the actual client may have a custom rate. Lifetime Wealth here matches the dashboard's Lifetime Wealth card.",
  };

  return JSON.stringify(summary, null, 0);
}

async function runGetYearBreakdown(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const clientId = String(input.client_id ?? "");
  const year = Number(input.year);
  if (!clientId) throw new Error("client_id required");
  if (!Number.isFinite(year)) throw new Error("year must be a number");

  const { data: projection, error } = await ctx.supabase
    .from("projections")
    .select("baseline_years, blueprint_years")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(error.message);
  if (!projection) throw new Error("No projection yet — generate the report first.");

  type Row = Record<string, number | undefined | null> & { year: number };
  const baselineRow = (projection.baseline_years as Row[] | null)?.find((r) => r.year === year);
  const strategyRow = (projection.blueprint_years as Row[] | null)?.find((r) => r.year === year);

  if (!baselineRow && !strategyRow) {
    return `No data found for year ${year}. The projection may not cover that year.`;
  }

  // Normalize cents → dollars and keep only the fields advisors typically
  // ask about. Full row is hundreds of fields; this is the readable subset.
  const normalize = (row: Row | undefined) => {
    if (!row) return null;
    const n = (k: string) => Math.round(((row[k] ?? 0) as number) / 100);
    return {
      year: row.year,
      age: row.age,
      bracket: row.federalTaxBracket,
      rmd_dollars: n("rmdAmount"),
      conversion_dollars: n("conversionAmount"),
      ss_gross_dollars: n("ssIncome"),
      other_income_dollars: n("otherIncome"),
      total_income_dollars: n("totalIncome"),
      magi_dollars: n("magi"),
      agi_dollars: n("agi"),
      standard_deduction_dollars: n("standardDeduction"),
      taxable_income_dollars: n("taxableIncome"),
      federal_tax_dollars: n("federalTax"),
      state_tax_dollars: n("stateTax"),
      total_tax_dollars: n("totalTax"),
      irmaa_tier: row.irmaaTier,
      irmaa_surcharge_dollars: n("irmaaSurcharge"),
      traditional_boy_dollars: n("traditionalBOY"),
      traditional_balance_dollars: n("traditionalBalance"),
      roth_balance_dollars: n("rothBalance"),
      taxable_balance_dollars: n("taxableBalance"),
      net_worth_dollars: n("netWorth"),
      product_bonus_applied_dollars: n("productBonusApplied"),
      total_ira_withdrawal_dollars: n("totalIRAWithdrawal"),
      taxes_paid_from_ira_dollars: n("taxesPaidFromIRA"),
    };
  };

  return JSON.stringify(
    { year, baseline: normalize(baselineRow), strategy: normalize(strategyRow) },
    null,
    0
  );
}

async function runCreateSupportTicket(
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const subject = String(input.subject ?? "").trim();
  const description = String(input.description ?? "").trim();
  const category = String(input.category ?? "other");
  const severity = String(input.severity ?? "medium");
  const clientId = input.client_id ? String(input.client_id) : null;

  if (!subject) throw new Error("subject required");
  if (!description) throw new Error("description required");

  // Prepend a marker so admins can spot AI-escalated tickets at a glance —
  // reused for both the DB row and the Slack notification body.
  const markedDescription = `[AI-escalated from chat]\n\n${description}`;

  // Use the user-scoped client — RLS insert policy requires auth.uid() ===
  // user_id, so this fails fast if anything is off.
  const { data, error } = await ctx.supabase
    .from("support_tickets")
    .insert({
      user_id: ctx.userId,
      client_id: clientId,
      subject,
      description: markedDescription,
      severity,
      category,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to create ticket");

  ctx.sideEffects.ticketId = data.id;

  // Slack notification — mirrors the manual-submit path in
  // app/api/support-tickets/route.ts so AI-escalated tickets surface in the
  // support channel too (previously they were created silently and only
  // manual/advisor-submitted tickets pinged Slack). Best-effort: the ticket
  // already exists, so a Slack/lookup failure must never fail the tool. The
  // "[AI-escalated from chat]" marker rides along in the description so the
  // Slack card visibly flags these as AI-created.
  try {
    const [advisorSettingsRes, clientRes, userRes] = await Promise.all([
      ctx.supabase
        .from("user_settings")
        .select("first_name, last_name")
        .eq("user_id", ctx.userId)
        .maybeSingle(),
      clientId
        ? ctx.supabase.from("clients").select("name").eq("id", clientId).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      ctx.supabase.auth.getUser(),
    ]);
    const advisorEmail = userRes.data?.user?.email ?? null;
    const advisorName =
      [advisorSettingsRes.data?.first_name, advisorSettingsRes.data?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || advisorEmail || "Advisor";

    await notifySlackNewTicket({
      ticketId: data.id,
      subject,
      description: markedDescription,
      severity: severity as SupportSeverity,
      category: category as SupportCategory,
      advisorName,
      advisorEmail,
      clientName: (clientRes.data?.name as string | undefined) ?? null,
    });
  } catch (err) {
    console.error("[chat] Slack notify for AI-escalated ticket failed", err);
  }

  return JSON.stringify({
    ticket_id: data.id,
    status: "filed",
    note:
      "Ticket filed successfully. Tell the advisor it's in the queue and you've shared the relevant context.",
  });
}
