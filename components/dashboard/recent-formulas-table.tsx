"use client";

import Link from "next/link";

interface RecentFormula {
  id: string;
  clientName: string;
  productLabel: string;
  percentChange: number;
  createdAt: string;
}

interface RecentFormulasTableProps {
  data: RecentFormula[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentFormulasTable({ data }: RecentFormulasTableProps) {
  return (
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 hover:bg-[#1F1F1F] hover:border-[#F5B800] transition-all">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#A0A0A0] mb-4">
        Recent Formulas
      </h3>

      {data.length === 0 ? (
        <p className="text-sm text-[#6B6B6B] text-center py-8">No Formulas yet</p>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#A0A0A0] border-b border-[#2A2A2A]">
                  Client
                </th>
                <th className="text-left pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#A0A0A0] border-b border-[#2A2A2A]">
                  Product
                </th>
                <th className="text-right pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#A0A0A0] border-b border-[#2A2A2A]">
                  Change
                </th>
                <th className="text-right pb-3 text-[11px] font-semibold uppercase tracking-wide text-[#A0A0A0] border-b border-[#2A2A2A]">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-[#1A1A1A] cursor-pointer transition-colors"
                >
                  <td className="py-3 border-b border-[#2A2A2A]">
                    <Link
                      href={`/clients/${item.id}`}
                      className="text-sm text-white hover:text-[#F5B800] transition-colors"
                    >
                      {item.clientName}
                    </Link>
                  </td>
                  <td className="py-3 border-b border-[#2A2A2A]">
                    <span className="text-sm text-[#A0A0A0]">{item.productLabel}</span>
                  </td>
                  <td className="py-3 border-b border-[#2A2A2A] text-right">
                    <span
                      className={`text-sm font-semibold ${
                        item.percentChange >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {item.percentChange >= 0 ? "+" : ""}
                      {item.percentChange}%
                    </span>
                  </td>
                  <td className="py-3 border-b border-[#2A2A2A] text-right">
                    <span className="text-sm text-[#6B6B6B]">
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
              View All Formulas &rarr;
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
