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
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7">
        <h3 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-6">
          Product Mix
        </h3>
        <p className="text-sm text-[rgba(255,255,255,0.25)] text-center py-8">No data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7 transition-all duration-250 hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(212,175,55,0.3)]">
      <h3 className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-6">
        Product Mix
      </h3>

      <div className="flex flex-col items-center">
        <div className="w-[140px] h-[140px] mb-5">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={coloredData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={65}
                dataKey="value"
                stroke="none"
              >
                {coloredData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#141414",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "13px",
                }}
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
            <div key={item.name} className="flex items-center justify-between py-2 border-t border-[rgba(255,255,255,0.07)]">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[13px] text-[rgba(255,255,255,0.5)]">{item.name}</span>
              </div>
              <span className="text-[13px] font-mono text-[rgba(255,255,255,0.5)]">
                {item.value}{" "}
                <span className="text-[rgba(255,255,255,0.25)]">
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
