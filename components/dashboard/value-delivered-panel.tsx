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
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7 transition-all duration-250 hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(212,175,55,0.3)]">
      <h3 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-2">
        Value Delivered
      </h3>
      <p className="text-xs text-[rgba(255,255,255,0.25)] mb-6">
        Your impact across all client scenarios
      </p>

      <div className="space-y-5">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-[13px] text-[rgba(255,255,255,0.5)] mb-1">{item.label}</p>
            <p className="text-[22px] font-mono font-medium text-gold">
              {formatWholeDollars(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
