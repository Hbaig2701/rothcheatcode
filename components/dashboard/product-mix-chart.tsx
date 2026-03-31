"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface ProductMixItem {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

interface ProductMixChartProps {
  data: ProductMixItem[];
}

export function ProductMixChart({ data }: ProductMixChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // Update colors to use the new gold palette
  const coloredData = data.map((item, index) => ({
    ...item,
    color: index === 0 ? "#d4af37" : `rgba(212, 175, 55, ${0.7 - index * 0.15})`,
  }));

  if (data.length === 0) {
    return (
      <div className="bg-bg-card border border-border-default rounded-[14px] p-7">
        <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-6">
          Product Mix
        </h3>
        <p className="text-sm text-text-dim text-center py-8">No data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-default rounded-[14px] p-7 transition-all duration-250 hover:bg-bg-card-hover hover:border-border-hover">
      <h3 className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-6">
        Product Mix
      </h3>

      <div className="flex flex-col items-center">
        <div className="w-[160px] h-[160px] mb-5">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={coloredData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={65}
                dataKey="value"
                nameKey="name"
                stroke="none"
              >
                {coloredData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "13px",
                }}
                itemStyle={{ color: "rgba(255,255,255,0.85)" }}
                formatter={(value: number | undefined, name: string | undefined) => [
                  `${value ?? 0} (${total > 0 && value ? Math.round((value / total) * 100) : 0}%)`,
                  name ?? "",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2 w-full">
          {coloredData.map((item) => (
            <div key={item.name} className="flex items-center justify-between py-2 border-t border-border-default">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-text-muted">{item.name}</span>
              </div>
              <span className="text-sm font-mono text-text-muted">
                {item.value}{" "}
                <span className="text-text-dim">
                  ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
