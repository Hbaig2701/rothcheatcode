"use client";

import { formatWholeDollars } from "@/lib/calculations/utils/money";

interface ValueDeliveredPanelProps {
  totalLifetimeWealth: number;  // cents
  totalTaxSavings: number;      // cents
  totalLegacyProtected: number; // cents
}

export function ValueDeliveredPanel({
  totalLifetimeWealth,
  totalTaxSavings,
  totalLegacyProtected,
}: ValueDeliveredPanelProps) {
  const items = [
    {
      label: "Total Lifetime Wealth Created",
      value: totalLifetimeWealth,
    },
    {
      label: "Total Tax Savings",
      value: Math.abs(totalTaxSavings),
    },
    {
      label: "Total Legacy Protected",
      value: totalLegacyProtected,
    },
  ];

  return (
    <div className="bg-bg-card border border-border-default rounded-[14px] p-7 transition-all duration-250 hover:bg-bg-card-hover hover:border-border-hover">
      <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-2">
        Value Delivered
      </h3>
      <p className="text-sm text-text-dim mb-6">
        Your impact across all client scenarios
      </p>

      <div className="space-y-5">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-sm text-text-dim mb-1">{item.label}</p>
            <p className="text-[24px] font-mono font-medium text-gold">
              {formatWholeDollars(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
