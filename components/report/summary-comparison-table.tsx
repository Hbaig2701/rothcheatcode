"use client";

import { Projection } from "@/lib/types/projection";
import { YearlyResult } from "@/lib/calculations"; // Assuming this export exists
import { cn } from "@/lib/utils";

interface SummaryComparisonTableProps {
    projection: Projection;
}

export function SummaryComparisonTable({ projection }: SummaryComparisonTableProps) {
    // Helper to sum up fields from the yearly arrays
    const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
        years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

    const heirTaxRate = 0.40;

    // --- Baseline Metrics ---
    const baseRMDs = sum(projection.baseline_years, 'rmdAmount');
    const baseTax = sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax');
    const baseIrmaa = sum(projection.baseline_years, 'irmaaSurcharge');
    const baseFinalBalance = projection.baseline_final_net_worth;

    // Baseline: RMDs are actual distributions received
    const baseAfterTaxDist = baseRMDs - baseTax;
    // Baseline: Legacy at 60% (heirs pay 40% tax on Traditional IRA)
    const baseNetLegacy = baseFinalBalance * (1 - heirTaxRate);
    const baseLegacyTax = baseFinalBalance * heirTaxRate;

    // --- Blueprint Metrics ---
    const blueConversions = sum(projection.blueprint_years, 'conversionAmount');
    const blueTax = sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax');
    const blueIrmaa = sum(projection.blueprint_years, 'irmaaSurcharge');
    const blueFinalBalance = projection.blueprint_final_net_worth;

    // Blueprint: Conversions are NOT distributions (money stays in account)
    // Blueprint: Legacy at 100% (Roth has no heir tax)
    const blueNetLegacy = blueFinalBalance;
    const blueLegacyTax = 0; // Roth has no heir tax

    // --- Lifetime Wealth Calculation (must match report-dashboard.tsx) ---
    // BASELINE: (eoy_combined * 0.60) + cumulativeAfterTaxDistributions - cumulativeIRMAA
    const baseLifetimeWealth = baseNetLegacy + baseAfterTaxDist - baseIrmaa;

    // BLUEPRINT: eoy_combined - cumulativeTaxes - cumulativeIRMAA
    const blueLifetimeWealth = blueFinalBalance - blueTax - blueIrmaa;

    // For display purposes - show what client paid/received
    const baseTotalCosts = baseTax + baseIrmaa + baseLegacyTax;
    const blueTotalCosts = blueTax + blueIrmaa + blueLegacyTax;

    const toUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val / 100);

    // Row Definition: { label, type: 'header' | 'data', base?, blue? }
    // Check for GI data
    const hasGI = projection.gi_total_net_paid != null && projection.gi_total_net_paid > 0;

    const rows = [
        { label: "Client Distributions", type: "header" },
        { label: "RMDs / Conversions", type: "data", base: baseRMDs, blue: blueConversions },
        { label: "Taxes Paid", type: "data", base: baseTax, blue: blueTax },
        { label: "After-Tax Distributions", type: "data", base: baseAfterTaxDist, blue: 0, note: "Blueprint: $0 (conversions stay in account)" },

        // GI row - only shown for Guaranteed Income products
        ...(hasGI ? [
            { label: "Guaranteed Income", type: "header" },
            { label: "Lifetime After-Tax GI Payments", type: "data", base: 0, blue: projection.gi_total_net_paid! },
        ] : []),

        { label: "IRMAA", type: "header" },
        { label: "Total IRMAA Surcharges", type: "data", base: baseIrmaa, blue: blueIrmaa },

        { label: "Legacy to Heirs", type: "header" },
        { label: "Account Balance at Death", type: "data", base: baseFinalBalance, blue: blueFinalBalance },
        { label: "Heir Tax (40% on Traditional)", type: "data", base: baseLegacyTax, blue: blueLegacyTax },
        { label: "Net Legacy to Heirs", type: "data", base: baseNetLegacy, blue: blueNetLegacy },

        { label: "Lifetime Wealth Summary", type: "header" },
        { label: "Total Costs (Taxes + IRMAA + Heir Tax)", type: "data", base: baseTotalCosts, blue: blueTotalCosts },
        { label: "Lifetime Wealth", type: "data", base: baseLifetimeWealth, blue: blueLifetimeWealth, highlight: true },
        { label: "Difference", type: "difference_row", value: blueLifetimeWealth - baseLifetimeWealth },
    ];

    return (
        <div className="w-full bg-[#0A0A0A] rounded-sm border border-[#2A2A2A] text-xs">
            <div className="grid grid-cols-4 bg-[#0A0A0A] border-b border-[#2A2A2A] p-2 font-bold text-[#A0A0A0] uppercase tracking-wider">
                <div>Metric</div>
                <div className="text-right">Baseline Trajectory</div>
                <div className="text-right text-[#F5B800]">Blueprint Trajectory</div>
                <div className="text-right text-[#F5B800]">Difference</div>
            </div>
            <div className="divide-y divide-[#2A2A2A]/30">
                {rows.map((row, i) => {
                    if (row.type === "header") {
                        return (
                            <div key={i} className="p-2 bg-[#0A0A0A]/50 text-[#6B6B6B] font-bold uppercase tracking-wider text-[10px] mt-2">
                                {row.label}
                            </div>
                        );
                    }

                    if (row.type === "difference_row") {
                        // Percentage calc: (Blue - Base) / Base
                        // row.value is absolute diff. We need to calculate percent from components.
                        // But I passed hardcoded value in rows definition.
                        // Let's rely on row.value being the Diff Amount, and calculate percent dynamically or pass percent.
                        // Actually, simpler to calculate percent directly here:
                        const pct = baseLifetimeWealth !== 0 ? ((blueLifetimeWealth - baseLifetimeWealth) / baseLifetimeWealth) : 0;

                        return (
                            <div key={i} className="grid grid-cols-4 p-2 items-center bg-[#F5B800]/10 border-t border-[#F5B800]/20">
                                <div className="text-[#F5B800] font-bold uppercase tracking-wider text-[11px]">{row.label}</div>
                                <div className="text-right font-mono text-[#6B6B6B]">-</div>
                                <div className="text-right font-mono text-[#6B6B6B]">-</div>
                                <div className="text-right font-mono text-[#F5B800] font-bold text-sm">
                                    {new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'always' }).format(pct)}
                                </div>
                            </div>
                        );
                    }

                    const base = row.base ?? 0;
                    const blue = row.blue ?? 0;
                    const diff = blue - base;

                    let colorClass = "text-white";
                    if (row.label.includes("Wealth") || row.label.includes("Net Legacy")) {
                        colorClass = diff >= 0 ? "text-[#22C55E]" : "text-red-400";
                    } else if (row.label.includes("Tax") || row.label.includes("Costs") || row.label.includes("IRMAA")) {
                        colorClass = diff <= 0 ? "text-[#22C55E]" : "text-red-400";
                    } else {
                        colorClass = diff >= 0 ? "text-[#22C55E]" : "text-white";
                    }

                    return (
                        <div key={i} className={cn("grid grid-cols-4 p-2 items-center hover:bg-[#141414]/20", row.highlight && "bg-[#141414]/40 font-semibold")}>
                            <div className="text-[#A0A0A0]">{row.label}</div>
                            <div className="text-right font-mono text-[#A0A0A0]">{toUSD(base)}</div>
                            <div className="text-right font-mono text-[#F5B800]">{toUSD(blue)}</div>
                            <div className={cn("text-right font-mono", colorClass)}>
                                {toUSD(Math.abs(diff))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
