import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAffiliatePayouts } from "@/lib/affiliates/payouts";

// Monthly affiliate payout run. Scheduled in vercel.json (1st of the month).
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the same header
// lets an admin re-run it by hand (e.g. after topping up the Stripe balance
// when a transfer failed for insufficient funds). Safe to re-run: nothing is
// paid twice.
export const maxDuration = 300;

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function notifySlack(text: string) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[Affiliate payouts] Slack notify failed:", err);
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAffiliatePayouts(createAdminClient());

  const paid = results.filter((r) => r.outcome === "paid");
  const failed = results.filter((r) => r.outcome === "failed");
  console.log("[Affiliate payouts]", JSON.stringify(results));

  if (paid.length || failed.length) {
    const lines = [
      `:moneybag: *Affiliate payouts* — ${paid.length} paid (${money(paid.reduce((s, r) => s + (r.amount_cents ?? 0), 0))})` +
        (failed.length ? `, *${failed.length} failed*` : ""),
      ...paid.map((r) => `• ${r.name}: ${money(r.amount_cents ?? 0)}${r.reason ? ` (${r.reason})` : ""}`),
      ...failed.map((r) => `• :warning: ${r.name}: ${r.amount_cents ? money(r.amount_cents) + " — " : ""}${r.reason}`),
    ];
    if (failed.length) {
      lines.push("Failed balances roll into next month's run. If Stripe reported insufficient funds, top up the balance and re-run the cron.");
    }
    await notifySlack(lines.join("\n"));
  }

  return NextResponse.json({ results });
}
