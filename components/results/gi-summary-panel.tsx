"use client";

import type { Projection } from "@/lib/types/projection";

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
                            <span className="text-xs text-[#A0A0A0]">Income Start Age</span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_income_start_age ?? "—"}
                            </span>
                        </div>
                        {projection.gi_payout_percent != null && (
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-[#A0A0A0]">Payout Percentage</span>
                                <span className="text-xs font-mono text-[#F5B800]">
                                    {projection.gi_payout_percent.toFixed(2)}%
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0]">Annual Income (Gross)</span>
                            <span className="text-xs font-mono text-[#F5B800] font-bold">
                                {projection.gi_annual_income_gross
                                    ? toUSD(projection.gi_annual_income_gross)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0]">Annual Income (Net)</span>
                            <span className="text-xs font-mono text-[#F5B800]">
                                {projection.gi_annual_income_net
                                    ? toUSD(projection.gi_annual_income_net)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0]">Account Depletion Age</span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_depletion_age ?? "Never"}
                            </span>
                        </div>
                        {projection.gi_depletion_age && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0]">Income After Depletion</span>
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
                            <span className="text-xs text-[#A0A0A0]">At Policy Start</span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_income_base_at_start
                                    ? toUSD(projection.gi_income_base_at_start)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0]">At Income Start</span>
                            <span className="text-xs font-mono text-[#F5B800] font-bold">
                                {projection.gi_income_base_at_income_age
                                    ? toUSD(projection.gi_income_base_at_income_age)
                                    : "—"}
                            </span>
                        </div>
                        {projection.gi_income_base_at_start && projection.gi_income_base_at_income_age && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0]">Growth</span>
                                <span className="text-xs font-mono text-[#F5B800]">
                                    {toUSD(projection.gi_income_base_at_income_age - projection.gi_income_base_at_start)}
                                </span>
                            </div>
                        )}
                        {projection.gi_roll_up_description && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0]">Roll-Up</span>
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
                            <span className="text-xs text-[#A0A0A0]">Total Gross Paid</span>
                            <span className="text-xs font-mono text-white">
                                {projection.gi_total_gross_paid
                                    ? toUSD(projection.gi_total_gross_paid)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-[#A0A0A0]">Total Net Paid</span>
                            <span className="text-xs font-mono text-[#F5B800] font-bold">
                                {projection.gi_total_net_paid
                                    ? toUSD(projection.gi_total_net_paid)
                                    : "—"}
                            </span>
                        </div>
                        {projection.gi_total_rider_fees != null && projection.gi_total_rider_fees > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-[#A0A0A0]">Total Rider Fees</span>
                                <span className="text-xs font-mono text-red-400">
                                    {toUSD(projection.gi_total_rider_fees)}
                                </span>
                            </div>
                        )}
                        {projection.gi_total_gross_paid && projection.gi_total_net_paid && (
                            <div className="flex justify-between items-center pt-1 border-t border-[#2A2A2A]">
                                <span className="text-xs text-[#A0A0A0]">Effective Tax Rate</span>
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
