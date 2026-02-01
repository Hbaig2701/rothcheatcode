"use client";

import { formatWholeDollars } from "@/lib/calculations/utils/money";

interface ClientInsightsPanelProps {
  avgClientAge: number;
  avgDeposit: number; // cents
  filingStatusBreakdown: { single: number; mfj: number; mfs: number; hoh: number };
  totalClients: number;
  approachingRMDCount: number;
}

export function ClientInsightsPanel({
  avgClientAge,
  avgDeposit,
  filingStatusBreakdown,
  totalClients,
  approachingRMDCount,
}: ClientInsightsPanelProps) {
  const singlePct = totalClients > 0 ? Math.round((filingStatusBreakdown.single / totalClients) * 100) : 0;
  const mfjPct = totalClients > 0 ? Math.round((filingStatusBreakdown.mfj / totalClients) * 100) : 0;
  const mfsPct = totalClients > 0 ? Math.round((filingStatusBreakdown.mfs / totalClients) * 100) : 0;
  const hohPct = totalClients > 0 ? Math.round((filingStatusBreakdown.hoh / totalClients) * 100) : 0;

  return (
    <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-6 hover:bg-[#242f42] hover:border-teal-500 transition-all">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b95a5] mb-6">
        Client Insights
      </h3>

      <div className="space-y-5">
        {/* Average Client Age */}
        <div>
          <p className="text-sm text-[#8b95a5] mb-1">Average Client Age</p>
          <p className="text-xl font-bold text-white">{avgClientAge} years old</p>
        </div>

        {/* Average Initial Deposit */}
        <div>
          <p className="text-sm text-[#8b95a5] mb-1">Average Initial Deposit</p>
          <p className="text-xl font-bold text-white">{formatWholeDollars(avgDeposit)}</p>
        </div>

        {/* Filing Status Breakdown */}
        <div>
          <p className="text-sm text-[#8b95a5] mb-3">Filing Status Breakdown</p>
          <div className="space-y-2">
            {singlePct > 0 && (
              <StatusBar label="Single" percent={singlePct} />
            )}
            {mfjPct > 0 && (
              <StatusBar label="MFJ" percent={mfjPct} />
            )}
            {mfsPct > 0 && (
              <StatusBar label="MFS" percent={mfsPct} />
            )}
            {hohPct > 0 && (
              <StatusBar label="HOH" percent={hohPct} />
            )}
            {totalClients === 0 && (
              <p className="text-xs text-[#5f6b7a]">No data</p>
            )}
          </div>
        </div>

        {/* Approaching RMD */}
        <div>
          <p className="text-sm text-[#8b95a5] mb-1">Approaching RMD Age (75)</p>
          <p className="text-xl font-bold text-yellow-400">
            {approachingRMDCount}{" "}
            <span className="text-sm font-normal text-[#5f6b7a]">
              clients within 3 years
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#8b95a5]">{label}</span>
        <span className="text-white">{percent}%</span>
      </div>
      <div className="w-full h-2 bg-[#0f1419] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-green-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
