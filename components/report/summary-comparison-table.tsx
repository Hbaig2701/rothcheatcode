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

    // --- 1. Distributions ---
    const baseDistConversions = sum(projection.baseline_years, 'rmdAmount') + sum(projection.baseline_years, 'conversionAmount');
    const blueDistConversions = sum(projection.blueprint_years, 'rmdAmount') + sum(projection.blueprint_years, 'conversionAmount');

    const baseTax = sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax');
    const blueTax = sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax');

    // Practical implementation: Lifetime After-Tax Distributions = Distributions / Conversions − Tax on Distributions / Conversions
    const baseAfterTaxDist = baseDistConversions - baseTax;
    const blueAfterTaxDist = blueDistConversions - blueTax;

    // --- 2. IRMAA ---
    const baseIrmaa = sum(projection.baseline_years, 'irmaaSurcharge');
    const blueIrmaa = sum(projection.blueprint_years, 'irmaaSurcharge');

    // --- 3. Heirs (Legacy) ---
    // Using final balances
    const baseLegacyPreTax = projection.baseline_final_traditional + projection.baseline_final_roth + projection.baseline_final_taxable;
    const blueLegacyPreTax = projection.blueprint_final_traditional + projection.blueprint_final_roth + projection.blueprint_final_taxable;

    // Estimate Tax on Legacy (assuming mostly Traditional IRA tax at 40% for legacy, 0% for Roth/Taxable basis)
    // This is a simplification. The backend might have 'heir_benefit' which is the net. 
    // We'll approximate: Legacy Tax = Traditional * 0.40 (or user heuristic).
    // Actually, let's use: PreTax - NetWorth (if NetWorth is after tax).
    // projection.baseline_final_net_worth is likely After Tax Legacy value.
    const baseNetLegacy = projection.baseline_final_net_worth;
    const blueNetLegacy = projection.blueprint_final_net_worth;

    const baseLegacyTax = baseLegacyPreTax - baseNetLegacy;
    const blueLegacyTax = blueLegacyPreTax - blueNetLegacy;

    // --- 4. Wealth Summary ---
    // User Request: Total Distributions = Lifetime After-Tax Distributions + Net Legacy Distribution
    const baseTotalDist = baseAfterTaxDist + baseNetLegacy;
    const blueTotalDist = blueAfterTaxDist + blueNetLegacy;

    const baseTotalCosts = baseTax + baseIrmaa; // Tax + IRMAA
    const blueTotalCosts = blueTax + blueIrmaa;

    // User Request: Lifetime Wealth = Total Distributions - Total Costs
    const baseLifetimeWealth = baseTotalDist - baseTotalCosts;
    const blueLifetimeWealth = blueTotalDist - blueTotalCosts;

    const toUSD = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val / 100);

    // Row Definition: { label, type: 'header' | 'data', base?, blue? }
    const rows = [
        { label: "Distributions", type: "header" },
        { label: "Distributions / Conversions", type: "data", base: baseDistConversions, blue: blueDistConversions },
        { label: "Tax on Distributions / Conversions", type: "data", base: baseTax, blue: blueTax },
        { label: "Roth Distributions", type: "data", base: 0, blue: 0 },
        { label: "Lifetime After-Tax Distributions", type: "data", base: baseAfterTaxDist, blue: blueAfterTaxDist },

        { label: "IRMAA", type: "header" },
        { label: "IRA-Related IRMAA", type: "data", base: baseIrmaa, blue: blueIrmaa },

        { label: "Heirs", type: "header" },
        { label: "Legacy Distribution", type: "data", base: baseLegacyPreTax, blue: blueLegacyPreTax },
        { label: "Tax on Legacy Distribution", type: "data", base: baseLegacyTax, blue: blueLegacyTax },
        { label: "Net Legacy Distribution", type: "data", base: baseNetLegacy, blue: blueNetLegacy },

        { label: "Wealth", type: "header" },
        { label: "Total Distributions", type: "data", base: baseTotalDist, blue: blueTotalDist }, // Re-listing
        { label: "Total Costs", type: "data", base: baseTotalCosts, blue: blueTotalCosts },
        { label: "Lifetime Wealth", type: "data", base: baseLifetimeWealth, blue: blueLifetimeWealth, highlight: true },
    ];

    return (
        <div className="w-full bg-[#0f172a] rounded-sm border border-slate-800 text-xs">
            <div className="grid grid-cols-4 bg-[#020617] border-b border-slate-800 p-2 font-bold text-slate-400 uppercase tracking-wider">
                <div>Metric</div>
                <div className="text-right">Baseline Trajectory</div>
                <div className="text-right">Blueprint Trajectory</div>
                <div className="text-right">Difference</div>
            </div>
            <div className="divide-y divide-slate-800/30">
                {rows.map((row, i) => {
                    if (row.type === "header") {
                        return (
                            <div key={i} className="p-2 bg-slate-900/50 text-slate-500 font-bold uppercase tracking-wider text-[10px] mt-2">
                                {row.label}
                            </div>
                        );
                    }

                    const base = row.base ?? 0;
                    const blue = row.blue ?? 0;
                    const diff = blue - base;

                    let colorClass = "text-slate-200";
                    if (row.label.includes("Wealth") || row.label.includes("Net Legacy")) {
                        colorClass = diff >= 0 ? "text-emerald-400" : "text-red-400";
                    } else if (row.label.includes("Tax") || row.label.includes("Costs") || row.label.includes("IRMAA")) {
                        colorClass = diff <= 0 ? "text-emerald-400" : "text-red-400"; // Lower costs = Green
                    } else {
                        colorClass = diff >= 0 ? "text-emerald-400" : "text-slate-200";
                    }

                    return (
                        <div key={i} className={cn("grid grid-cols-4 p-2 items-center hover:bg-slate-800/20", row.highlight && "bg-slate-800/40 font-semibold")}>
                            <div className="text-slate-300">{row.label}</div>
                            <div className="text-right font-mono text-slate-400">{toUSD(base)}</div>
                            <div className="text-right font-mono text-blue-300">{toUSD(blue)}</div>
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
