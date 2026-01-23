"use client";

import { useRef } from "react";
import { useProjection } from "@/lib/queries/projections";
import { useClient } from "@/lib/queries/clients";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData } from '@/lib/calculations/transforms';
import { Skeleton } from "@/components/ui/skeleton";
import { YearOverYearTables } from "@/components/report/year-over-year-tables";
import { SummaryComparisonTable } from "@/components/report/summary-comparison-table";
import { ExportPdfButton, ReportChartRefs } from "@/components/report/export-pdf-button";
import { cn } from "@/lib/utils";
import { YearlyResult } from "@/lib/calculations";

interface ReportDashboardProps {
    clientId: string;
}

export function ReportDashboard({ clientId }: ReportDashboardProps) {
    const { data: client, isLoading: clientLoading } = useClient(clientId);
    const { data: projectionResponse, isLoading: projectionLoading } = useProjection(clientId);

    // Refs for chart capture (PDF export)
    const lifetimeWealthChartRef = useRef<HTMLDivElement>(null);
    const chartRefs: ReportChartRefs = {
        lifetimeWealth: lifetimeWealthChartRef,
    };

    if (clientLoading || projectionLoading) {
        return <div className="p-8 space-y-4 bg-[#080c14] h-full"><Skeleton className="h-12 w-full bg-slate-800" /><Skeleton className="h-64 w-full bg-slate-800" /></div>;
    }

    if (!client || !projectionResponse?.projection) {
        return <div className="p-8 bg-[#080c14] h-full text-slate-400">No data available. Please recalculate.</div>;
    }

    const { projection } = projectionResponse;
    const chartData = transformToChartData(projection);

    // Helper methods
    const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
        years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

    const toUSD = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount / 100);
    const toPercent = (amount: number) => new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(amount);

    // --- Calculate Lifetime Wealth ---
    // BLUEPRINT: eoy_combined - cumulativeTaxes - cumulativeIRMAA
    //   (Roth passes tax-free, conversions aren't distributions but taxes are costs)
    const calculateBlueprintLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
        const totalTaxes = sum(years, 'federalTax') + sum(years, 'stateTax');
        const totalIRMAA = sum(years, 'irmaaSurcharge');
        return finalNetWorth - totalTaxes - totalIRMAA;
    };

    // BASELINE: (eoy_combined * 0.60) + cumulativeAfterTaxDistributions - cumulativeIRMAA
    //   (Traditional has 40% heir tax, RMDs are actual distributions received)
    const calculateBaselineLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
        const heirTaxRate = 0.40;
        const totalRMDs = sum(years, 'rmdAmount');
        const totalTaxes = sum(years, 'federalTax') + sum(years, 'stateTax');
        const totalIRMAA = sum(years, 'irmaaSurcharge');

        // After-tax distributions = RMDs - taxes paid
        const afterTaxDistributions = totalRMDs - totalTaxes;

        // Legacy at 60% (heir pays 40% tax) + cumulative distributions - IRMAA
        const netLegacy = finalNetWorth * (1 - heirTaxRate);
        return netLegacy + afterTaxDistributions - totalIRMAA;
    };

    const baseLifetime = calculateBaselineLifetimeWealth(projection.baseline_years, projection.baseline_final_net_worth);
    const blueLifetime = calculateBlueprintLifetimeWealth(projection.blueprint_years, projection.blueprint_final_net_worth);

    const diff = blueLifetime - baseLifetime;
    const percentChange = baseLifetime > 0 ? diff / baseLifetime : 0;

    return (
        <div className="flex flex-col h-full bg-[#080c14] text-slate-200 overflow-y-auto font-sans">

            {/* Top Navigation Tabs */}
            <div className="flex bg-[#0f172a] border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider shrink-0">
                <div className="px-6 py-3 bg-[#0ea5e9] text-white">Blueprint</div>
                <div className="px-6 py-3 text-slate-500 hover:text-slate-300 cursor-pointer">New Record</div>
                <div className="px-6 py-3 text-slate-500 hover:text-slate-300 cursor-pointer">Chart</div>
                <div className="px-6 py-3 text-slate-500 hover:text-slate-300 cursor-pointer">Grid</div>
            </div>

            <div className="p-6 space-y-8">

                {/* Header Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conversion Insights</h3>
                        <ExportPdfButton
                            client={client}
                            projection={projection}
                            chartRefs={chartRefs}
                            variant="outline"
                            size="sm"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-px bg-slate-800 border border-slate-800 text-xs">
                        {/* Custom Grid Rows for Header Stats */}
                        <div className="flex justify-between items-center px-4 py-2 bg-[#0f172a]">
                            <span className="text-slate-400 font-medium">Client Name</span>
                            <span className="font-mono text-slate-200">{client.name}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 bg-[#0f172a]">
                            <span className="text-slate-400 font-medium">Initial Balance</span>
                            <span className="font-mono text-slate-200">{toUSD(client.qualified_account_value)}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 bg-[#0f172a]">
                            <span className="text-slate-400 font-medium">Lifetime Wealth Before Blueprint</span>
                            <span className="font-mono text-slate-200">{toUSD(baseLifetime)}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 bg-[#0f172a]">
                            <span className="text-slate-400 font-medium">Lifetime Wealth After Blueprint</span>
                            <span className="font-mono text-emerald-400 font-bold">{toUSD(blueLifetime)}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 bg-[#0f172a]">
                            <span className="text-slate-400 font-medium">Percent Change</span>
                            <span className="font-mono text-emerald-400 font-bold">{toPercent(percentChange)}</span>
                        </div>
                    </div>
                </div>

                {/* Chart Section */}
                {/* Added min-h to prevent overlap */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-6 min-h-[480px] relative">
                    <div className="text-center mb-4">
                        <h4 className="text-base font-semibold text-slate-100">Lifetime Wealth Trajectory</h4>
                        <p className="text-xs text-slate-500 mt-1">Total wealth if client passes at each age (distributions + legacy - costs)</p>
                        <div className="flex justify-center gap-8 mt-3 text-[11px] font-medium">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <span className="w-3 h-0.5 bg-emerald-500 rounded"></span>
                                Blueprint (Roth)
                            </div>
                            <div className="flex items-center gap-2 text-red-400">
                                <span className="w-3 h-0.5 bg-red-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #ef4444 0px, #ef4444 4px, transparent 4px, transparent 6px)' }}></span>
                                Baseline (Traditional)
                            </div>
                        </div>
                    </div>
                    <div ref={lifetimeWealthChartRef} className="h-[360px] w-full bg-[#0f172a]">
                        <WealthChart data={chartData} breakEvenAge={projection.break_even_age} />
                    </div>
                </div>

                {/* Detailed Comparison Table */}
                <div className="pt-2">
                    <SummaryComparisonTable projection={projection} />
                </div>

                {/* Year-over-Year Tables with Scenario Toggle */}
                <div className="pt-8">
                    <YearOverYearTables
                        baselineYears={projection.baseline_years}
                        blueprintYears={projection.blueprint_years}
                        client={client}
                    />
                </div>

            </div>
        </div>
    );
}
