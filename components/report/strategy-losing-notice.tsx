"use client";

import type { Client } from "@/lib/types/client";

interface StrategyLosingNoticeProps {
  /** True when the strategy's lifetime wealth is below the do-nothing baseline. */
  isLosing: boolean;
  client: Client;
}

/**
 * Shown whenever the Roth-conversion strategy is projected to leave the client
 * with LESS lifetime wealth than doing nothing (Additional Lifetime Wealth < 0).
 * Now that conversion tax is honestly funded (no longer hidden), aggressive /
 * high-bracket conversions can legitimately come out negative — advisors used to
 * always-positive numbers need to know why and what to change. Renders nothing
 * when the strategy is at or above break-even.
 */
export function StrategyLosingNotice({ isLosing, client }: StrategyLosingNoticeProps) {
  if (!isLosing) return null;

  const bracket = client.max_tax_rate ?? 24;
  const hasTaxable = (client.taxable_accounts ?? 0) > 0;

  return (
    <div className="mx-9 mt-6 rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-sm text-red-900 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200">
      <span className="font-semibold">
        This conversion leaves the client with less than doing nothing.
      </span>{" "}
      The projected lifetime wealth is below the &ldquo;do nothing&rdquo; baseline
      — usually a sign the strategy is converting too aggressively for its tax
      cost (too much converted at a high bracket, with the tax paid up front). To
      turn it positive: lower the{" "}
      <span className="font-semibold">Max Tax Rate</span> (currently {bracket}%)
      so less converts at high rates, spread the conversion over more years
      {hasTaxable ? "" : ", or fund the conversion tax from a taxable account instead of the IRA"}
      . Adjust and watch the number climb back above zero.
    </div>
  );
}
