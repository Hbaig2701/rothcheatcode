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
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6 transition-all duration-250 hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(212,175,55,0.3)]">
      <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.65)] mb-2">
        Conversion Pipeline
      </h3>
      <p className="text-sm text-[rgba(255,255,255,0.6)] mb-5">
        Clients currently in active Roth conversion
      </p>

      {/* Summary stats */}
      <div className="flex gap-8 mb-6">
        <div>
          <span className="text-sm text-[rgba(255,255,255,0.6)]">Active Conversions: </span>
          <span className="text-sm font-mono font-medium text-white">{activePipelineCount} clients</span>
        </div>
        <div>
          <span className="text-sm text-[rgba(255,255,255,0.6)]">Total Value in Progress: </span>
          <span className="text-sm font-mono font-medium text-white">
            {formatWholeDollars(totalPipelineValue)}
          </span>
        </div>
      </div>

      {/* Pipeline table */}
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left pb-2 text-xs font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.65)] border-b border-[rgba(255,255,255,0.07)]">
              Client
            </th>
            <th className="text-left pb-2 text-xs font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.65)] border-b border-[rgba(255,255,255,0.07)]">
              Product
            </th>
            <th className="text-left pb-2 text-xs font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.65)] border-b border-[rgba(255,255,255,0.07)]">
              Progress
            </th>
            <th className="text-right pb-2 text-xs font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.65)] border-b border-[rgba(255,255,255,0.07)]">
              Remaining
            </th>
            <th className="pb-2 text-xs font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.65)] border-b border-[rgba(255,255,255,0.07)] w-40 text-center">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {pipeline.map((item) => (
            <tr
              key={item.clientId}
              className="hover:bg-[rgba(255,255,255,0.045)] transition-colors"
            >
              <td className="py-2.5 text-sm text-[rgba(255,255,255,0.7)]">
                {item.clientName}
              </td>
              <td className="py-2.5 text-sm text-[rgba(255,255,255,0.65)]">
                {item.productLabel}
              </td>
              <td className="py-2.5 text-sm font-mono text-[rgba(255,255,255,0.7)]">
                Year {item.currentYear}/{item.totalYears}
              </td>
              <td className="py-2.5 text-sm font-mono text-[rgba(255,255,255,0.7)] text-right">
                {formatWholeDollars(item.remainingAmount)}
              </td>
              <td className="py-2.5 w-40">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.04)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.isComplete
                          ? "bg-[#4ade80]"
                          : "bg-gradient-to-r from-gold to-[rgba(212,175,55,0.7)]"
                      }`}
                      style={{ width: `${item.percentComplete}%` }}
                    />
                  </div>
                  {item.isComplete && (
                    <Check className="w-4 h-4 text-[#4ade80] shrink-0" />
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
