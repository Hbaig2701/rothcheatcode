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
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Guaranteed Income Summary
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Panel 1: Guaranteed Income Overview */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                        Income Overview
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">Income Start Age</span>
                            <span className="text-xs font-mono text-slate-200">
                                {projection.gi_income_start_age ?? "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">Annual Income (Gross)</span>
                            <span className="text-xs font-mono text-emerald-400 font-bold">
                                {projection.gi_annual_income_gross
                                    ? toUSD(projection.gi_annual_income_gross)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">Annual Income (Net)</span>
                            <span className="text-xs font-mono text-emerald-400">
                                {projection.gi_annual_income_net
                                    ? toUSD(projection.gi_annual_income_net)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">Account Depletion Age</span>
                            <span className="text-xs font-mono text-slate-200">
                                {projection.gi_depletion_age ?? "Never"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Panel 2: Income Base Snapshot */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                        Income Base
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">At Policy Start</span>
                            <span className="text-xs font-mono text-slate-200">
                                {projection.gi_income_base_at_start
                                    ? toUSD(projection.gi_income_base_at_start)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">At Income Start</span>
                            <span className="text-xs font-mono text-blue-400 font-bold">
                                {projection.gi_income_base_at_income_age
                                    ? toUSD(projection.gi_income_base_at_income_age)
                                    : "—"}
                            </span>
                        </div>
                        {projection.gi_income_base_at_start && projection.gi_income_base_at_income_age && (
                            <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                                <span className="text-xs text-slate-400">Growth</span>
                                <span className="text-xs font-mono text-blue-400">
                                    {toUSD(projection.gi_income_base_at_income_age - projection.gi_income_base_at_start)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel 3: Lifetime Income Totals */}
                <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                        Lifetime Totals
                    </h4>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">Total Gross Paid</span>
                            <span className="text-xs font-mono text-slate-200">
                                {projection.gi_total_gross_paid
                                    ? toUSD(projection.gi_total_gross_paid)
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">Total Net Paid</span>
                            <span className="text-xs font-mono text-amber-400 font-bold">
                                {projection.gi_total_net_paid
                                    ? toUSD(projection.gi_total_net_paid)
                                    : "—"}
                            </span>
                        </div>
                        {projection.gi_total_gross_paid && projection.gi_total_net_paid && (
                            <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                                <span className="text-xs text-slate-400">Effective Tax Rate</span>
                                <span className="text-xs font-mono text-slate-300">
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
