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

  if (data.length === 0) {
    return (
      <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b95a5] mb-6">
          Product Mix
        </h3>
        <p className="text-sm text-[#5f6b7a] text-center py-8">No data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-6 hover:bg-[#242f42] hover:border-teal-500 transition-all">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8b95a5] mb-6">
        Product Mix
      </h3>

      <div className="flex flex-col items-center">
        <div className="w-48 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a2332",
                  border: "1px solid #2d3a4f",
                  borderRadius: "8px",
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

        <div className="mt-4 space-y-2 w-full">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[#8b95a5]">{item.name}</span>
              </div>
              <span className="text-white font-medium">
                {item.value}{" "}
                <span className="text-[#5f6b7a]">
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
