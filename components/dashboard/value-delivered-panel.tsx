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
      color: "text-teal-400",
    },
    {
      label: "Total Tax Savings",
      value: totalTaxSavings,
      description: "Taxes saved through optimized conversions",
      color: "text-green-400",
    },
    {
      label: "Total Legacy Protected",
      value: totalLegacyProtected,
      description: "Heir tax avoided (40% saved on Roth balances)",
      color: "text-blue-400",
    },
  ];

  return (
    <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-6 hover:bg-[#242f42] hover:border-teal-500 transition-all">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b95a5] mb-1">
        Value Delivered
      </h3>
      <p className="text-[13px] text-[#5f6b7a] mb-6">
        Your impact across all client CheatCodes
      </p>

      <div className="space-y-6">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-sm text-[#8b95a5] mb-1">{item.label}</p>
            <p className={`text-2xl font-bold ${item.color}`}>
              {formatWholeDollars(item.value)}
            </p>
            <p className="text-xs text-[#5f6b7a] mt-1">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
