"use client";

import type { Projection } from "@/lib/types/projection";
import { InfoTooltip } from "@/components/report/info-tooltip";
import { GI_TOOLTIPS } from "@/lib/config/gi-tooltips";

interface GISummaryPanelProps {
    projection: Projection;
}

export function GISummaryPanel({ projection }: GISummaryPanelProps) {
    const toUSD = (val: number) =>
        new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(val / 100);

    return (
        <div className="space-y-4">
            <h3 className="text-xs font-bold text-[#A0A0A0] uppercase tracking-widest">
                Guaranteed Income Summary
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Panel 1: Guaranteed Income Overview */}
                <div className="bg-[#141414] border border-[#2A2A2A] rounded-lg p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-[#F5B800] uppercase tracking-wider">
                        Income Overview
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                Income Start Age
                                <InfoTooltip text={GI_TOOLTIPS.incomeStartAge} />
                            </span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_income_start_age ?? "\u2014"}
                            </span>
                        </div>
                        {projection.gi_payout_percent != null && (
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                    Payout Percentage
                                    <InfoTooltip text={GI_TOOLTIPS.payoutPercentage} />
                                </span>
                                <span className="text-xs font-mono text-[#F5B800]">
                                    {projection.gi_payout_percent.toFixed(2)}%
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                Annual Income (Gross)
                                <InfoTooltip text={GI_TOOLTIPS.annualIncomeGross} />
                            </span>
                            <span className="text-xs font-mono text-[#F5B800] font-bold">
                                {projection.gi_annual_income_gross
                                    ? toUSD(projection.gi_annual_income_gross)
                                    : "\u2014"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                Annual Income (Net)
                                <InfoTooltip text={GI_TOOLTIPS.annualIncomeNet} />
                            </span>
                            <span className="text-xs font-mono text-[#F5B800]">
                                {projection.gi_annual_income_net
                                    ? toUSD(projection.gi_annual_income_net)
                                    : "\u2014"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                Account Depletion Age
                                <InfoTooltip text={GI_TOOLTIPS.accountDepletionAge} />
                            </span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_depletion_age ?? "Never"}
                            </span>
                        </div>
                        {projection.gi_depletion_age && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                    Income After Depletion
                                    <InfoTooltip text={GI_TOOLTIPS.incomeAfterDepletion} />
                                </span>
                                <span className="text-xs font-mono text-emerald-400 font-bold">
                                    Continues
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel 2: Income Base Snapshot */}
                <div className="bg-[#141414] border border-[#2A2A2A] rounded-lg p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-[#F5B800] uppercase tracking-wider">
                        Income Base
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                At Policy Start
                                <InfoTooltip text={GI_TOOLTIPS.incomeBaseAtStart} />
                            </span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_income_base_at_start
                                    ? toUSD(projection.gi_income_base_at_start)
                                    : "\u2014"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                At Income Start
                                <InfoTooltip text={GI_TOOLTIPS.incomeBaseAtIncomeStart} />
                            </span>
                            <span className="text-xs font-mono text-[#F5B800] font-bold">
                                {projection.gi_income_base_at_income_age
                                    ? toUSD(projection.gi_income_base_at_income_age)
                                    : "\u2014"}
                            </span>
                        </div>
                        {projection.gi_income_base_at_start && projection.gi_income_base_at_income_age && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                    Growth
                                    <InfoTooltip text={GI_TOOLTIPS.incomeBaseGrowth} />
                                </span>
                                <span className="text-xs font-mono text-[#F5B800]">
                                    {toUSD(projection.gi_income_base_at_income_age - projection.gi_income_base_at_start)}
                                </span>
                            </div>
                        )}
                        {projection.gi_roll_up_description && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                    Roll-Up
                                    <InfoTooltip text={GI_TOOLTIPS.rollUpRate} />
                                </span>
                                <span className="text-xs font-mono text-[#A0A0A0]">
                                    {projection.gi_roll_up_description}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel 3: Lifetime Income Totals */}
                <div className="bg-[#141414] border border-[#2A2A2A] rounded-lg p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-[#F5B800] uppercase tracking-wider">
                        Lifetime Totals
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                Total Gross Paid
                                <InfoTooltip text={GI_TOOLTIPS.totalGrossPaid} />
                            </span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_total_gross_paid
                                    ? toUSD(projection.gi_total_gross_paid)
                                    : "\u2014"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                Total Net Paid
                                <InfoTooltip text={GI_TOOLTIPS.totalNetPaid} />
                            </span>
                            <span className="text-xs font-mono text-[#F5B800] font-bold">
                                {projection.gi_total_net_paid
                                    ? toUSD(projection.gi_total_net_paid)
                                    : "\u2014"}
                            </span>
                        </div>
                        {projection.gi_total_rider_fees != null && projection.gi_total_rider_fees > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                    Total Rider Fees
                                    <InfoTooltip text={GI_TOOLTIPS.totalRiderFees} />
                                </span>
                                <span className="text-xs font-mono text-red-400">
                                    {toUSD(projection.gi_total_rider_fees)}
                                </span>
                            </div>
                        )}
                        {projection.gi_total_gross_paid && projection.gi_total_net_paid && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                                    Effective Tax Rate
                                    <InfoTooltip text={GI_TOOLTIPS.effectiveTaxRate} />
                                </span>
                                <span className="text-xs font-mono text-[#A0A0A0]">
                                    {(((projection.gi_total_gross_paid - projection.gi_total_net_paid) / projection.gi_total_gross_paid) * 100).toFixed(1)}%
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
