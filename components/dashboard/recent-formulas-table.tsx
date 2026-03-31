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
      className={`inline-block px-3 py-1 rounded-[20px] text-sm font-mono font-medium ${
        isPositive
          ? "bg-green-bg text-green"
          : "bg-red-bg text-red"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}%
    </span>
  );
}

export function RecentFormulasTable({ data }: RecentFormulasTableProps) {
  return (
    <div className="bg-bg-card border border-border-default rounded-[14px] p-6 transition-all duration-250 hover:bg-bg-card-hover hover:border-border-hover">
      <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-5">
        Recent Scenarios
      </h3>

      {data.length === 0 ? (
        <p className="text-sm text-text-dim text-center py-8">No scenarios yet</p>
      ) : (
        <>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left pb-2 text-xs font-normal uppercase tracking-[0.5px] text-text-muted border-b border-border-default">
                  Client
                </th>
                <th className="text-left pb-2 text-xs font-normal uppercase tracking-[0.5px] text-text-muted border-b border-border-default">
                  Product
                </th>
                <th className="text-right pb-2 text-xs font-normal uppercase tracking-[0.5px] text-text-muted border-b border-border-default">
                  Change
                </th>
                <th className="text-right pb-2 text-xs font-normal uppercase tracking-[0.5px] text-text-muted border-b border-border-default">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer transition-colors hover:bg-bg-card-hover"
                >
                  <td className="py-2.5">
                    <Link
                      href={`/clients/${item.id}`}
                      className="text-sm text-text-muted hover:text-gold transition-colors"
                    >
                      {item.clientName}
                    </Link>
                  </td>
                  <td className="py-2.5">
                    <span className="text-sm text-text-muted">{item.productLabel}</span>
                  </td>
                  <td className="py-2.5 text-right">
                    <DeltaBadge value={item.percentChange} />
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-sm font-mono text-text-dim">
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
