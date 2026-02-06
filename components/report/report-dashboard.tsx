"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjection } from "@/lib/queries/projections";
import { useClient, useCreateClient } from "@/lib/queries/clients";
import { WealthChart } from "@/components/results/wealth-chart";
import { transformToChartData, transformToGIChartData } from '@/lib/calculations/transforms';
import { Skeleton } from "@/components/ui/skeleton";
import { YearOverYearTables } from "@/components/report/year-over-year-tables";
import { GIYearOverYearTables } from "@/components/report/gi-year-over-year-tables";
import { SummaryComparisonTable } from "@/components/report/summary-comparison-table";
import { GISummaryBreakdownTable } from "@/components/report/gi-summary-breakdown-table";
import { ReportChartRefs } from "@/components/report/export-pdf-button";
import { captureChartAsBase64 } from "@/lib/utils/captureChart";
import { YearlyResult } from "@/lib/calculations";
import { GISummaryPanel } from "@/components/results/gi-summary-panel";
import { GIAccountChart } from "@/components/results/gi-account-chart";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import { InfoTooltip } from "@/components/report/info-tooltip";
import { GI_TOOLTIPS } from "@/lib/config/gi-tooltips";

interface ReportDashboardProps {
    clientId: string;
}

export function ReportDashboard({ clientId }: ReportDashboardProps) {
    const router = useRouter();
    const { data: client, isLoading: clientLoading } = useClient(clientId);
    const { data: projectionResponse, isLoading: projectionLoading } = useProjection(clientId);
    const createClient = useCreateClient();

    // Refs for chart capture (PDF export)
    const lifetimeWealthChartRef = useRef<HTMLDivElement>(null);
    const chartRefs: ReportChartRefs = {
        lifetimeWealth: lifetimeWealthChartRef,
    };

    if (clientLoading || projectionLoading) {
        return (
            <div className="p-9 space-y-4 h-full">
                <Skeleton className="h-12 w-full bg-[rgba(255,255,255,0.025)]" />
                <Skeleton className="h-64 w-full bg-[rgba(255,255,255,0.025)]" />
            </div>
        );
    }

    if (!client || !projectionResponse?.projection) {
        return (
            <div className="p-9 h-full text-[rgba(255,255,255,0.5)]">
                No data available. Please recalculate.
            </div>
        );
    }

    const { projection } = projectionResponse;
    const isGI = client.blueprint_type
        ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
        : false;

    const chartData = isGI ? transformToGIChartData(projection) : transformToChartData(projection);

    // Helper methods
    const sum = (years: YearlyResult[], key: keyof YearlyResult) =>
        years.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);

    const toUSD = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount / 100);
    const toPercent = (amount: number) => new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(amount);

    // --- Calculate Lifetime Wealth ---
    const calculateFormulaLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
        const totalTaxes = sum(years, 'federalTax') + sum(years, 'stateTax');
        const totalIRMAA = sum(years, 'irmaaSurcharge');
        return finalNetWorth - totalTaxes - totalIRMAA;
    };

    const calculateGIFormulaLifetimeWealthTotal = () => {
        const heirTaxRate = 0.40;
        const giYearlyData = projection.gi_yearly_data || [];
        let conversionTaxes = 0;
        projection.blueprint_years.forEach((year, i) => {
            const giYear = giYearlyData[i];
            if (giYear && giYear.phase === 'deferral') {
                conversionTaxes += (year.federalTax + year.stateTax) || 0;
            }
        });
        const totalIRMAA = sum(projection.blueprint_years, 'irmaaSurcharge');
        const netLegacy = Math.round(projection.blueprint_final_traditional * (1 - heirTaxRate)) + projection.blueprint_final_roth;
        const giTotalNet = projection.gi_total_net_paid ?? 0;
        return giTotalNet + netLegacy - conversionTaxes - totalIRMAA;
    };

    const calculateBaselineLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
        const heirTaxRate = 0.40;
        const totalRMDs = sum(years, 'rmdAmount');
        const totalTaxes = sum(years, 'federalTax') + sum(years, 'stateTax');
        const totalIRMAA = sum(years, 'irmaaSurcharge');
        const afterTaxDistributions = totalRMDs - totalTaxes;
        const netLegacy = finalNetWorth * (1 - heirTaxRate);
        return netLegacy + afterTaxDistributions - totalIRMAA;
    };

    const baseLifetime = calculateBaselineLifetimeWealth(projection.baseline_years, projection.baseline_final_net_worth);
    const blueLifetime = isGI
        ? calculateGIFormulaLifetimeWealthTotal()
        : calculateFormulaLifetimeWealth(projection.blueprint_years, projection.blueprint_final_net_worth);

    const diff = blueLifetime - baseLifetime;
    const percentChange = baseLifetime !== 0 ? diff / Math.abs(baseLifetime) : 0;

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="p-9 space-y-8">
                {/* Hero Comparison Cards */}
                <div className="bg-gradient-to-br from-[rgba(212,175,55,0.08)] to-[rgba(255,255,255,0.01)] border border-[rgba(212,175,55,0.2)] rounded-[18px] p-7">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <p className="text-sm uppercase tracking-[1.5px] text-[rgba(255,255,255,0.7)]">
                                Strategy vs Baseline
                            </p>
                            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">
                                {client.product_name} · {client.carrier_name} · Optimized Conversion
                            </p>
                        </div>
                        <span
                            className={`inline-block px-[18px] py-2 rounded-[20px] text-[18px] font-mono font-medium ${
                                percentChange >= 0
                                    ? "bg-[rgba(74,222,128,0.08)] text-[#4ade80]"
                                    : "bg-[rgba(248,113,113,0.08)] text-[#f87171]"
                            }`}
                        >
                            {percentChange >= 0 ? "+" : ""}{Math.round(percentChange * 100)}%
                        </span>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                        <MetricCard
                            label="Lifetime Wealth"
                            baseline={toUSD(baseLifetime)}
                            formula={toUSD(blueLifetime)}
                            diff={toUSD(diff)}
                            positive={diff >= 0}
                        />
                        <MetricCard
                            label="Total Distributions"
                            baseline={toUSD(sum(projection.baseline_years, 'rmdAmount'))}
                            formula={toUSD(sum(projection.blueprint_years, 'rmdAmount') + sum(projection.blueprint_years, 'conversionAmount'))}
                            diff={toUSD(sum(projection.blueprint_years, 'conversionAmount'))}
                            positive={true}
                        />
                        <MetricCard
                            label="Net Legacy"
                            baseline={toUSD(projection.baseline_final_net_worth * 0.6)}
                            formula={toUSD(projection.blueprint_final_roth + projection.blueprint_final_traditional * 0.6)}
                            diff={toUSD((projection.blueprint_final_roth + projection.blueprint_final_traditional * 0.6) - projection.baseline_final_net_worth * 0.6)}
                            positive={(projection.blueprint_final_roth + projection.blueprint_final_traditional * 0.6) >= projection.baseline_final_net_worth * 0.6}
                        />
                        <MetricCard
                            label="Total Costs"
                            baseline={toUSD(sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax') + sum(projection.baseline_years, 'irmaaSurcharge'))}
                            formula={toUSD(sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax') + sum(projection.blueprint_years, 'irmaaSurcharge'))}
                            diff={toUSD((sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax') + sum(projection.blueprint_years, 'irmaaSurcharge')) - (sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax') + sum(projection.baseline_years, 'irmaaSurcharge')))}
                            positive={false}
                        />
                    </div>
                </div>

                {/* GI Summary Panels - shown only for Guaranteed Income products */}
                {projection.gi_annual_income_gross != null && projection.gi_annual_income_gross > 0 && (
                    <GISummaryPanel projection={projection} />
                )}

                {/* Chart Section */}
                <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
                    <div className="text-center mb-6">
                        <h4 className="text-lg font-medium text-white">Lifetime Wealth Trajectory</h4>
                        <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">
                            {isGI
                                ? "Total wealth if client passes at each age (GI payments + legacy - costs)"
                                : "Total wealth if client passes at each age (distributions + legacy - costs)"}
                        </p>
                        <div className="flex justify-center gap-8 mt-4 text-xs">
                            <span className="flex items-center gap-2 text-gold">
                                <span className="w-3.5 h-0.5 bg-gold rounded" />
                                Strategy {isGI ? "(GI + Roth)" : "(Roth)"}
                            </span>
                            <span className="flex items-center gap-2 text-[rgba(255,255,255,0.5)]">
                                <span className="w-3.5 h-0.5 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 4px, transparent 4px, transparent 6px)' }} />
                                Baseline (Traditional)
                            </span>
                        </div>
                    </div>
                    <div ref={lifetimeWealthChartRef} className="h-[360px] w-full">
                        <WealthChart data={chartData} breakEvenAge={projection.break_even_age} />
                    </div>
                </div>

                {/* Detailed Comparison Table */}
                <div>
                    {isGI ? (
                        <GISummaryBreakdownTable projection={projection} />
                    ) : (
                        <SummaryComparisonTable projection={projection} />
                    )}
                </div>

                {/* Account Value vs Income Base Chart (GI Only) */}
                {isGI && projection.gi_yearly_data && projection.gi_yearly_data.length > 0 && (
                    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
                        <div className="text-center mb-6">
                            <h4 className="text-lg font-medium text-white">Account Value vs Income Base</h4>
                            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-1">
                                Tracking account value, income base, and Roth balance over time
                            </p>
                            <div className="flex justify-center gap-8 mt-4 text-xs">
                                <span className="flex items-center gap-2 text-gold">
                                    <span className="w-3.5 h-0.5 bg-gold rounded" />
                                    Roth Balance
                                </span>
                                <span className="flex items-center gap-2 text-[#f87171]">
                                    <span className="w-3.5 h-0.5 bg-[#f87171] rounded" />
                                    Account Value
                                </span>
                                <span className="flex items-center gap-2 text-[#4ade80]">
                                    <span className="w-3.5 h-0.5 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #22c55e 0px, #22c55e 2px, transparent 2px, transparent 6px)' }} />
                                    Income Base
                                </span>
                            </div>
                        </div>
                        <div className="h-[360px] w-full">
                            <GIAccountChart projection={projection} />
                        </div>
                    </div>
                )}

                {/* Year-over-Year Tables with Scenario Toggle */}
                <div className="pt-2">
                    {isGI ? (
                        <GIYearOverYearTables
                            baselineYears={projection.baseline_years}
                            formulaYears={projection.blueprint_years}
                            giYearlyData={projection.gi_yearly_data || []}
                            client={client}
                        />
                    ) : (
                        <YearOverYearTables
                            baselineYears={projection.baseline_years}
                            formulaYears={projection.blueprint_years}
                            client={client}
                        />
                    )}
                </div>

                {/* Disclaimer */}
                <p className="text-sm text-[rgba(255,255,255,0.4)] italic text-center py-4">
                    This optimized plan is for educational purposes only. Before making a Roth conversion, discuss your final plan with a tax professional.
                </p>
            </div>
        </div>
    );
}

// Metric Card Component
function MetricCard({
    label,
    baseline,
    formula,
    diff,
    positive,
}: {
    label: string;
    baseline: string;
    formula: string;
    diff: string;
    positive: boolean;
}) {
    return (
        <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-5">
            <p className="text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-4">
                {label}
            </p>
            <div className="flex justify-between items-baseline mb-2">
                <div>
                    <p className="text-[11px] text-[rgba(255,255,255,0.45)] mb-0.5">BASELINE</p>
                    <p className="text-lg font-mono text-[rgba(255,255,255,0.65)]">{baseline}</p>
                </div>
                <div className="text-right">
                    <p className="text-[11px] text-[rgba(255,255,255,0.45)] mb-0.5">STRATEGY</p>
                    <p className="text-lg font-mono font-medium text-white">{formula}</p>
                </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[rgba(255,255,255,0.07)]">
                <p className={`text-base font-mono font-medium ${positive ? "text-[#4ade80]" : "text-[#f87171]"}`}>
                    {diff}
                </p>
            </div>
        </div>
    );
}
