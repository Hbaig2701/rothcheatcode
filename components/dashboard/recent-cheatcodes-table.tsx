"use client";

import Link from "next/link";

interface RecentCheatCode {
  id: string;
  clientName: string;
  productLabel: string;
  percentChange: number;
  createdAt: string;
}

interface RecentCheatCodesTableProps {
  data: RecentCheatCode[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentCheatCodesTable({ data }: RecentCheatCodesTableProps) {
  return (
    <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-6 hover:bg-[#242f42] hover:border-[#F5B800] transition-all">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b95a5] mb-4">
        Recent CheatCodes
      </h3>

      {data.length === 0 ? (
        <p className="text-sm text-[#5f6b7a] text-center py-8">No CheatCodes yet</p>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
                  Client
                </th>
                <th className="text-left pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
                  Product
                </th>
                <th className="text-right pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
                  Change
                </th>
                <th className="text-right pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#8b95a5] border-b border-[#2d3a4f]">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-[#2d3a4f]/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 border-b border-[#2d3a4f]">
                    <Link
                      href={`/clients/${item.id}`}
                      className="text-sm text-white hover:text-[#F5B800] transition-colors"
                    >
                      {item.clientName}
                    </Link>
                  </td>
                  <td className="py-3 border-b border-[#2d3a4f]">
                    <span className="text-sm text-[#8b95a5]">{item.productLabel}</span>
                  </td>
                  <td className="py-3 border-b border-[#2d3a4f] text-right">
                    <span
                      className={`text-sm font-semibold ${
                        item.percentChange >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {item.percentChange >= 0 ? "+" : ""}
                      {item.percentChange}%
                    </span>
                  </td>
                  <td className="py-3 border-b border-[#2d3a4f] text-right">
                    <span className="text-sm text-[#5f6b7a]">
                      {formatDate(item.createdAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 text-center">
            <Link
              href="/clients"
              className="text-sm text-[#F5B800] hover:text-[#F5B800]/80 transition-colors"
            >
              View All CheatCodes &rarr;
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
