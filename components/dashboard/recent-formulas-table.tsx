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

function DeltaBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={`inline-block px-3 py-1 rounded-[20px] text-[13px] font-mono font-medium ${
        isPositive
          ? "bg-[rgba(74,222,128,0.08)] text-[#4ade80]"
          : "bg-[rgba(248,113,113,0.08)] text-[#f87171]"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}%
    </span>
  );
}

export function RecentFormulasTable({ data }: RecentFormulasTableProps) {
  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6 transition-all duration-250 hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(212,175,55,0.3)]">
      <h3 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-5">
        Recent Scenarios
      </h3>

      {data.length === 0 ? (
        <p className="text-sm text-[rgba(255,255,255,0.25)] text-center py-8">No scenarios yet</p>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left pb-2 text-[11px] font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.25)] border-b border-[rgba(255,255,255,0.07)]">
                  Client
                </th>
                <th className="text-left pb-2 text-[11px] font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.25)] border-b border-[rgba(255,255,255,0.07)]">
                  Product
                </th>
                <th className="text-right pb-2 text-[11px] font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.25)] border-b border-[rgba(255,255,255,0.07)]">
                  Change
                </th>
                <th className="text-right pb-2 text-[11px] font-normal uppercase tracking-[0.5px] text-[rgba(255,255,255,0.25)] border-b border-[rgba(255,255,255,0.07)]">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.045)]"
                >
                  <td className="py-2.5">
                    <Link
                      href={`/clients/${item.id}`}
                      className="text-[13px] text-[rgba(255,255,255,0.5)] hover:text-gold transition-colors"
                    >
                      {item.clientName}
                    </Link>
                  </td>
                  <td className="py-2.5">
                    <span className="text-[13px] text-[rgba(255,255,255,0.25)]">{item.productLabel}</span>
                  </td>
                  <td className="py-2.5 text-right">
                    <DeltaBadge value={item.percentChange} />
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-xs font-mono text-[rgba(255,255,255,0.25)]">
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
              className="text-sm text-gold hover:text-[rgba(212,175,55,0.8)] transition-colors"
            >
              View All Scenarios &rarr;
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
