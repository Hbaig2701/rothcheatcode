"use client";

import { Projection } from "@/lib/types/projection";
import { YearlyResult } from "@/lib/calculations";
import { cn } from "@/lib/utils";

interface GISummaryBreakdownTableProps {
    projection: Projection;
}

export function GISummaryBreakdownTable({ projection }: GISummaryBreakdownTableProps) {
    const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
        years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

    const heirTaxRate = 0.40;

    // --- Baseline Metrics (systematic withdrawals) ---
    const baseRMDs = sum(projection.baseline_years, 'rmdAmount');
    const baseTax = sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax');
    const baseIrmaa = sum(projection.baseline_years, 'irmaaSurcharge');
    const baseFinalTraditional = projection.baseline_final_traditional;
    const baseFinalRoth = projection.baseline_final_roth;
    const baseAfterTaxDist = baseRMDs - baseTax;
    const baseNetLegacy = Math.round(baseFinalTraditional * (1 - heirTaxRate)) + baseFinalRoth;
    const baseLegacyTax = Math.round(baseFinalTraditional * heirTaxRate);

    // --- Formula Metrics (GI + conversions) ---
    // Split taxes: deferral phase = conversion taxes, income phase = GI taxes
    const giYearlyData = projection.gi_yearly_data || [];
    let blueConversionTax = 0;
    projection.blueprint_years.forEach((year, i) => {
        const giYear = giYearlyData[i];
        if (giYear && giYear.phase === 'deferral') {
            blueConversionTax += (year.federalTax + year.stateTax) || 0;
        }
    });

    const blueConversions = sum(projection.blueprint_years, 'conversionAmount');
    const blueIrmaa = sum(projection.blueprint_years, 'irmaaSurcharge');
    const blueFinalTraditional = projection.blueprint_final_traditional; // Account Value
    const blueFinalRoth = projection.blueprint_final_roth;

    // GI-specific totals from projection
    const giTotalGross = projection.gi_total_gross_paid ?? 0;
    const giTotalNet = projection.gi_total_net_paid ?? 0;
    const giTaxOnPayments = giTotalGross - giTotalNet;

    // Formula legacy: account value taxed at heir rate, Roth tax-free
    const blueNetLegacy = Math.round(blueFinalTraditional * (1 - heirTaxRate)) + blueFinalRoth;
    const blueLegacyTax = Math.round(blueFinalTraditional * heirTaxRate);

    // --- Lifetime Wealth ---
    // Baseline: after-tax distributions + net legacy - IRMAA
    const baseTotalIncome = baseAfterTaxDist;
    const baseTotalCosts = baseTax + baseIrmaa + baseLegacyTax;
    const baseLifetimeWealth = baseAfterTaxDist + baseNetLegacy - baseIrmaa;

    // Formula: after-tax GI + net legacy - conversion taxes - IRMAA
    const blueTotalIncome = giTotalNet;
    const blueTotalCosts = blueConversionTax + blueIrmaa + blueLegacyTax;
    const blueLifetimeWealth = giTotalNet + blueNetLegacy - blueConversionTax - blueIrmaa;

    const toUSD = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val / 100);

    type Row = {
        label: string;
        type: "header" | "data" | "difference_row";
        base?: number;
        blue?: number;
        value?: number;
        highlight?: boolean;
    };

    const rows: Row[] = [
        { label: "Distributions", type: "header" },
        { label: "Conversions", type: "data", base: 0, blue: blueConversions },
        { label: "Tax on Conversions", type: "data", base: 0, blue: blueConversionTax },
        { label: "Guaranteed Income Payments (Gross)", type: "data", base: 0, blue: giTotalGross },
        { label: "Tax on Guaranteed Income", type: "data", base: 0, blue: giTaxOnPayments },
        { label: "Lifetime After-Tax GI Payments", type: "data", base: 0, blue: giTotalNet },
        { label: "Baseline Distributions (Gross)", type: "data", base: baseRMDs, blue: 0 },
        { label: "Tax on Baseline Distributions", type: "data", base: baseTax, blue: 0 },
        { label: "Lifetime After-Tax Baseline Dist.", type: "data", base: baseAfterTaxDist, blue: 0 },

        { label: "IRMAA", type: "header" },
        { label: "IRA-Related IRMAA", type: "data", base: baseIrmaa, blue: blueIrmaa },

        { label: "Heirs", type: "header" },
        { label: "Legacy Distribution (Account Value)", type: "data", base: baseFinalTraditional, blue: blueFinalTraditional },
        { label: "Legacy Distribution (Roth)", type: "data", base: baseFinalRoth, blue: blueFinalRoth },
        { label: "Tax on Legacy Distribution", type: "data", base: baseLegacyTax, blue: blueLegacyTax },
        { label: "Net Legacy Distribution", type: "data", base: baseNetLegacy, blue: blueNetLegacy },

        { label: "Lifetime Wealth Summary", type: "header" },
        { label: "Total Lifetime Income", type: "data", base: baseTotalIncome, blue: blueTotalIncome },
        { label: "Total Legacy", type: "data", base: baseNetLegacy, blue: blueNetLegacy },
        { label: "Total Costs", type: "data", base: baseTotalCosts, blue: blueTotalCosts },
        { label: "Lifetime Wealth", type: "data", base: baseLifetimeWealth, blue: blueLifetimeWealth, highlight: true },
        { label: "Difference", type: "difference_row", value: blueLifetimeWealth - baseLifetimeWealth },
    ];

    return (
        <div className="w-full bg-[#141414] rounded-sm border border-[#2A2A2A] text-xs">
            <div className="grid grid-cols-4 bg-[#141414] border-b border-[#2A2A2A] p-2 font-bold text-[#A0A0A0] uppercase tracking-wider">
                <div>Metric</div>
                <div className="text-right">Baseline Trajectory</div>
                <div className="text-right text-[#F5B800]">Formula Trajectory</div>
                <div className="text-right text-[#F5B800]">Difference</div>
            </div>
            <div className="divide-y divide-[#2A2A2A]/30">
                {rows.map((row, i) => {
                    if (row.type === "header") {
                        return (
                            <div key={i} className="p-2 bg-[#1A1A1A]/50 text-[#6B6B6B] font-bold uppercase tracking-wider text-[10px] mt-2">
                                {row.label}
                            </div>
                        );
                    }

                    if (row.type === "difference_row") {
                        const pct = baseLifetimeWealth !== 0
                            ? ((blueLifetimeWealth - baseLifetimeWealth) / Math.abs(baseLifetimeWealth))
                            : 0;

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
                    if (row.label.includes("Wealth") || row.label.includes("Net Legacy") || row.label.includes("After-Tax GI") || row.label.includes("Total Lifetime Income") || row.label.includes("Total Legacy")) {
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
