"use client";

import { Check } from "lucide-react";
import { formatWholeDollars } from "@/lib/calculations/utils/money";
import type { ConversionPipelineItem } from "@/lib/types/dashboard";

interface ConversionPipelineProps {
  pipeline: ConversionPipelineItem[];
  activePipelineCount: number;
  totalPipelineValue: number; // cents
}

export function ConversionPipeline({
  pipeline,
  activePipelineCount,
  totalPipelineValue,
}: ConversionPipelineProps) {
  if (pipeline.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-6 hover:bg-[#242f42] hover:border-[#F5B800] transition-all">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b95a5] mb-1">
        Conversion Pipeline
      </h3>
      <p className="text-[13px] text-[#5f6b7a] mb-4">
        Clients currently in active Roth conversion
      </p>

      {/* Summary stats */}
      <div className="flex gap-8 mb-6">
        <div>
          <span className="text-sm text-[#8b95a5]">Active Conversions: </span>
          <span className="text-sm font-semibold text-white">{activePipelineCount} clients</span>
        </div>
        <div>
          <span className="text-sm text-[#8b95a5]">Total Value in Progress: </span>
          <span className="text-sm font-semibold text-white">
            {formatWholeDollars(totalPipelineValue)}
          </span>
        </div>
      </div>

      {/* Pipeline table */}
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
              Client
            </th>
            <th className="text-left pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
              Product
            </th>
            <th className="text-left pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
              Progress
            </th>
            <th className="text-right pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
              Remaining
            </th>
            <th className="pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f] w-40 text-center">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {pipeline.map((item) => (
            <tr
              key={item.clientId}
              className="hover:bg-[#2d3a4f]/50 transition-colors"
            >
              <td className="py-3 border-b border-[#2d3a4f] text-sm text-white">
                {item.clientName}
              </td>
              <td className="py-3 border-b border-[#2d3a4f] text-sm text-[#8b95a5]">
                {item.productLabel}
              </td>
              <td className="py-3 border-b border-[#2d3a4f] text-sm text-white">
                Year {item.currentYear}/{item.totalYears}
              </td>
              <td className="py-3 border-b border-[#2d3a4f] text-sm text-white text-right">
                {formatWholeDollars(item.remainingAmount)}
              </td>
              <td className="py-3 border-b border-[#2d3a4f] w-40">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[#0f1419] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.isComplete
                          ? "bg-green-500"
                          : "bg-gradient-to-r from-[#F5B800] to-[#D4A000]"
                      }`}
                      style={{ width: `${item.percentComplete}%` }}
                    />
                  </div>
                  {item.isComplete && (
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
