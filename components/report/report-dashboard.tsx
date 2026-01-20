"use client";

import { useProjection } from "@/lib/queries/projections";
import { useClient } from "@/lib/queries/clients";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData } from '@/lib/calculations/transforms';
import { Skeleton } from "@/components/ui/skeleton";
import { YearByYearTable } from "@/components/results/deep-dive/year-by-year-table";
import { SummaryComparisonTable } from "@/components/report/summary-comparison-table";
import { cn } from "@/lib/utils";
import { YearlyResult } from "@/lib/calculations";

interface ReportDashboardProps {
    clientId: string;
}

export function ReportDashboard({ clientId }: ReportDashboardProps) {
    const { data: client, isLoading: clientLoading } = useClient(clientId);
    const { data: projectionResponse, isLoading: projectionLoading } = useProjection(clientId);

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

    // --- Calculate Lifetime Wealth (Same logic as table) ---
    const calculateLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
        // Dist + IRMAA for now? No, just Dist - Tax + NetLegacy
        const dist = sum(years, 'rmdAmount') + sum(years, 'conversionAmount');
        const tax = sum(years, 'federalTax') + sum(years, 'stateTax');
        const afterTaxDist = dist - tax;
        return afterTaxDist + finalNetWorth;
    }

    const baseLifetime = calculateLifetimeWealth(projection.baseline_years, projection.baseline_final_net_worth);
    const blueLifetime = calculateLifetimeWealth(projection.blueprint_years, projection.blueprint_final_net_worth);

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
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conversion Insights</h3>

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
                <div className="bg-[#0f172a] border border-slate-800 rounded-sm p-6 min-h-[450px] relative">
                    <div className="text-center mb-6">
                        <h4 className="text-sm font-semibold text-slate-200">Lifetime Wealth Comparison</h4>
                        <div className="flex justify-center gap-6 mt-2 text-[10px] uppercase tracking-wider font-semibold">
                            <div className="flex items-center gap-2 text-[#3b82f6]"><span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span> Blueprint Trajectory</div>
                            <div className="flex items-center gap-2 text-[#ef4444]"><span className="w-2 h-2 rounded-full bg-[#ef4444]"></span> Current Trajectory</div>
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <WealthChart data={chartData} breakEvenAge={projection.break_even_age} />
                    </div>
                </div>

                {/* Detailed Comparison Table */}
                <div className="pt-2">
                    <SummaryComparisonTable projection={projection} />
                </div>

                {/* Bottom Year By Year (if needed, keeping it as it was in previous step just in case) */}
                <div className="pt-8">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Projected Year by Year Values</h3>
                    <div className="bg-black border border-slate-800 rounded-sm overflow-x-auto text-[10px]">
                        <YearByYearTable years={projection.blueprint_years} scenario="blueprint" />
                    </div>
                </div>

            </div>
        </div>
    );
}
