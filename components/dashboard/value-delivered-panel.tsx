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
      description: "Sum of all CheatCode Lifetime Wealth values",
      color: "text-[#F5B800]",
    },
    {
      label: "Total Tax Savings",
      value: Math.abs(totalTaxSavings),
      description: "Taxes saved through optimized conversions",
      color: "text-[#F5B800]",
    },
    {
      label: "Total Legacy Protected",
      value: totalLegacyProtected,
      description: "Heir tax avoided (40% saved on Roth balances)",
      color: "text-[#F5B800]",
    },
  ];

  return (
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 hover:bg-[#1F1F1F] hover:border-[#F5B800] transition-all">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#A0A0A0] mb-1">
        Value Delivered
      </h3>
      <p className="text-[13px] text-[#6B6B6B] mb-6">
        Your impact across all client CheatCodes
      </p>

      <div className="space-y-6">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-sm text-[#A0A0A0] mb-1">{item.label}</p>
            <p className={`text-2xl font-bold ${item.color}`}>
              {formatWholeDollars(item.value)}
            </p>
            <p className="text-xs text-[#6B6B6B] mt-1">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
