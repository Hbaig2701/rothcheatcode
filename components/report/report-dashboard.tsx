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
import { cn } from "@/lib/utils";
import { YearlyResult } from "@/lib/calculations";
import { GISummaryPanel } from "@/components/results/gi-summary-panel";
import { GIAccountChart } from "@/components/results/gi-account-chart";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import { Copy, Plus, FileText, Loader2 } from "lucide-react";

interface ReportDashboardProps {
    clientId: string;
}

export function ReportDashboard({ clientId }: ReportDashboardProps) {
    const router = useRouter();
    const { data: client, isLoading: clientLoading } = useClient(clientId);
    const { data: projectionResponse, isLoading: projectionLoading } = useProjection(clientId);
    const createClient = useCreateClient();

    // Loading states for buttons
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    // Refs for chart capture (PDF export)
    const lifetimeWealthChartRef = useRef<HTMLDivElement>(null);
    const chartRefs: ReportChartRefs = {
        lifetimeWealth: lifetimeWealthChartRef,
    };

    // Handle duplicate formula
    const handleDuplicate = async () => {
        if (!client) return;
        setIsDuplicating(true);

        try {
            // Create a copy of the client data without system fields
            const { id, user_id, created_at, updated_at, ...clientData } = client;
            const duplicateData = {
                ...clientData,
                name: `Copy of ${client.name}`,
            };

            const newClient = await createClient.mutateAsync(duplicateData);
            router.push(`/clients/${newClient.id}/results`);
        } catch (error) {
            console.error("Failed to duplicate formula:", error);
            alert("Failed to duplicate formula. Please try again.");
        } finally {
            setIsDuplicating(false);
        }
    };

    // Handle new formula
    const handleNewFormula = () => {
        router.push("/clients/new");
    };

    // Handle PDF export
    const handleExportPdf = async () => {
        if (!client || !projectionResponse?.projection) return;
        setIsExportingPdf(true);

        try {
            // Capture chart as base64
            const lifetimeWealthChart = await captureChartAsBase64(lifetimeWealthChartRef, {
                quality: 0.95,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
                delay: 300,
            });

            // Call PDF generation API
            const response = await fetch('/api/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reportData: { client, projection: projectionResponse.projection },
                    charts: { lifetimeWealth: lifetimeWealthChart },
                }),
            });

            if (!response.ok) throw new Error('PDF generation failed');

            // Download the PDF
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().split('T')[0];
            link.download = `RothFormula_${client.name.replace(/\s+/g, '_')}_${timestamp}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("PDF export error:", error);
            alert("Failed to export PDF. Please try again.");
        } finally {
            setIsExportingPdf(false);
        }
    };

    if (clientLoading || projectionLoading) {
        return <div className="p-8 space-y-4 bg-[#0D0D0D] h-full"><Skeleton className="h-12 w-full bg-[#141414]" /><Skeleton className="h-64 w-full bg-[#141414]" /></div>;
    }

    if (!client || !projectionResponse?.projection) {
        return <div className="p-8 bg-[#0D0D0D] h-full text-[#A0A0A0]">No data available. Please recalculate.</div>;
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
    // FORMULA (Growth): eoy_combined - cumulativeTaxes - cumulativeIRMAA
    const calculateFormulaLifetimeWealth = (years: YearlyResult[], finalNetWorth: number) => {
        const totalTaxes = sum(years, 'federalTax') + sum(years, 'stateTax');
        const totalIRMAA = sum(years, 'irmaaSurcharge');
        return finalNetWorth - totalTaxes - totalIRMAA;
    };

    // FORMULA (GI): cumulativeNetGI + netLegacy(acctVal*(1-heirTax) + roth) - convTaxes - IRMAA
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

    // BASELINE: (eoy_combined * 0.60) + cumulativeAfterTaxDistributions - cumulativeIRMAA
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
        <div className="flex flex-col h-full bg-[#0D0D0D] text-white overflow-y-auto font-sans">
            <div className="p-6 space-y-8">

                {/* Action Button Bar */}
                <div className="flex items-center justify-between bg-[#1A1A1A] rounded-lg p-3">
                    <div className="flex items-center gap-3">
                        {/* Duplicate Button - Outline Style */}
                        <button
                            onClick={handleDuplicate}
                            disabled={isDuplicating}
                            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-[#F5B800] bg-transparent border border-[#F5B800] rounded-md hover:bg-[#F5B800]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDuplicating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                            Duplicate
                        </button>

                        {/* New Formula Button - Solid Style */}
                        <button
                            onClick={handleNewFormula}
                            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-black bg-[#F5B800] rounded-md hover:bg-[#DEAD00] hover:shadow-[0_0_20px_rgba(245,184,0,0.3)] transition-all"
                        >
                            <Plus className="h-4 w-4" />
                            New Formula
                        </button>

                        {/* Export PDF Button - Solid Style */}
                        <button
                            onClick={handleExportPdf}
                            disabled={isExportingPdf}
                            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-black bg-[#F5B800] rounded-md hover:bg-[#DEAD00] hover:shadow-[0_0_20px_rgba(245,184,0,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExportingPdf ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <FileText className="h-4 w-4" />
                            )}
                            Export as PDF
                        </button>
                    </div>
                </div>

                {/* Header Section */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold text-[#A0A0A0] uppercase tracking-widest">Conversion Insights</h3>

                    <div className="grid grid-cols-1 gap-px bg-[#2A2A2A] border border-[#2A2A2A] text-xs">
                        <div className="flex justify-between items-center px-4 py-2 bg-[#141414]">
                            <span className="text-[#A0A0A0] font-medium">Client Name</span>
                            <span className="font-mono text-white">{client.name}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 bg-[#141414]">
                            <span className="text-[#A0A0A0] font-medium">Initial Balance</span>
                            <span className="font-mono text-white">{toUSD(client.qualified_account_value)}</span>
                        </div>
                        {isGI && projection.gi_income_start_age != null && (
                            <div className="flex justify-between items-center px-4 py-2 bg-[#141414]">
                                <span className="text-[#A0A0A0] font-medium">Income Start Age</span>
                                <span className="font-mono text-white">{projection.gi_income_start_age}</span>
                            </div>
                        )}
                        {isGI && projection.gi_annual_income_gross != null && (
                            <div className="flex justify-between items-center px-4 py-2 bg-[#141414]">
                                <span className="text-[#A0A0A0] font-medium">Guaranteed Annual Income</span>
                                <span className="font-mono text-[#F5B800] font-bold">{toUSD(projection.gi_annual_income_gross)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center px-4 py-2 bg-[#141414]">
                            <span className="text-[#A0A0A0] font-medium">Lifetime Wealth Before Formula</span>
                            <span className="font-mono text-white">{toUSD(baseLifetime)}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 bg-[#141414]">
                            <span className="text-[#A0A0A0] font-medium">Lifetime Wealth After Formula</span>
                            <span className="font-mono text-[#F5B800] font-bold">{toUSD(blueLifetime)}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 bg-[#141414]">
                            <span className="text-[#A0A0A0] font-medium">Percent Change</span>
                            <span className="font-mono text-[#22C55E] font-bold">{toPercent(percentChange)}</span>
                        </div>
                    </div>
                </div>

                {/* GI Summary Panels - shown only for Guaranteed Income products */}
                {projection.gi_annual_income_gross != null && projection.gi_annual_income_gross > 0 && (
                    <GISummaryPanel projection={projection} />
                )}

                {/* Chart Section */}
                <div className="bg-[#141414] border border-[#2A2A2A] rounded-lg p-6 min-h-[480px] relative">
                    <div className="text-center mb-4">
                        <h4 className="text-base font-semibold text-white">Lifetime Wealth Trajectory</h4>
                        <p className="text-xs text-[#6B6B6B] mt-1">
                            {isGI
                                ? "Total wealth if client passes at each age (GI payments + legacy - costs)"
                                : "Total wealth if client passes at each age (distributions + legacy - costs)"}
                        </p>
                        <div className="flex justify-center gap-8 mt-3 text-[11px] font-medium">
                            <div className="flex items-center gap-2 text-[#F5B800]">
                                <span className="w-3 h-0.5 bg-[#F5B800] rounded"></span>
                                Formula {isGI ? "(GI + Roth)" : "(Roth)"}
                            </div>
                            <div className="flex items-center gap-2 text-red-400">
                                <span className="w-3 h-0.5 bg-red-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #ef4444 0px, #ef4444 4px, transparent 4px, transparent 6px)' }}></span>
                                Baseline (Traditional)
                            </div>
                        </div>
                    </div>
                    <div ref={lifetimeWealthChartRef} className="h-[360px] w-full bg-[#141414]">
                        <WealthChart data={chartData} breakEvenAge={projection.break_even_age} />
                    </div>
                </div>

                {/* Detailed Comparison Table */}
                <div className="pt-2">
                    {isGI ? (
                        <GISummaryBreakdownTable projection={projection} />
                    ) : (
                        <SummaryComparisonTable projection={projection} />
                    )}
                </div>

                {/* Account Value vs Income Base Chart (GI Only) */}
                {isGI && projection.gi_yearly_data && projection.gi_yearly_data.length > 0 && (
                    <div className="bg-[#141414] border border-[#2A2A2A] rounded-lg p-6 min-h-[480px] relative">
                        <div className="text-center mb-4">
                            <h4 className="text-base font-semibold text-white">Account Value vs Income Base</h4>
                            <p className="text-xs text-[#6B6B6B] mt-1">Tracking account value, income base, and Roth balance over time</p>
                            <div className="flex justify-center gap-8 mt-3 text-[11px] font-medium">
                                <div className="flex items-center gap-2 text-[#F5B800]">
                                    <span className="w-3 h-0.5 bg-[#F5B800] rounded"></span>
                                    Roth Balance
                                </div>
                                <div className="flex items-center gap-2 text-red-400">
                                    <span className="w-3 h-0.5 bg-red-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #ef4444 0px, #ef4444 4px, transparent 4px, transparent 6px)' }}></span>
                                    Account Value
                                </div>
                                <div className="flex items-center gap-2 text-[#22C55E]">
                                    <span className="w-3 h-0.5 bg-[#22C55E] rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #22c55e 0px, #22c55e 2px, transparent 2px, transparent 6px)' }}></span>
                                    Income Base
                                </div>
                            </div>
                        </div>
                        <div className="h-[360px] w-full bg-[#141414]">
                            <GIAccountChart projection={projection} />
                        </div>
                    </div>
                )}

                {/* Year-over-Year Tables with Scenario Toggle */}
                <div className="pt-8">
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

            </div>
        </div>
    );
}
