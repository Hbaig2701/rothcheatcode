'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Projection, GIYearlyData } from '@/lib/types/projection';
import type { YearlyResult } from '@/lib/calculations';
import { formatAxisValue } from '@/lib/calculations/transforms';

interface GIAccountChartProps {
  projection: Projection;
}

interface GIChartDataPoint {
  age: number;
  accountValue: number;
  incomeBase: number;
  rothBalance: number;
}

function transformToGIAccountChartData(
  blueprintYears: YearlyResult[],
  giYearlyData: GIYearlyData[]
): GIChartDataPoint[] {
  return blueprintYears.map((year, index) => {
    const giYear = giYearlyData[index];
    return {
      age: year.age,
      accountValue: giYear?.accountValue ?? year.traditionalBalance,
      incomeBase: giYear?.incomeBase ?? 0,
      rothBalance: year.rothBalance,
    };
  });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const formatVal = (cents: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(cents / 100);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
      <p className="text-slate-400 text-xs font-medium mb-2">Age {label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs font-mono" style={{ color: entry.color }}>
          {entry.name}: {formatVal(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function GIAccountChart({ projection }: GIAccountChartProps) {
  const data = transformToGIAccountChartData(
    projection.blueprint_years,
    projection.gi_yearly_data || []
  );

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#334155"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="age"
            label={{
              value: 'Age',
              position: 'bottom',
              offset: 0,
              fill: '#94a3b8',
              fontSize: 12,
            }}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={{ stroke: '#475569' }}
            axisLine={{ stroke: '#475569' }}
          />
          <YAxis
            tickFormatter={formatAxisValue}
            width={65}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={{ stroke: '#475569' }}
            axisLine={{ stroke: '#475569' }}
            domain={[0, 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Roth Balance - blue solid */}
          <Line
            type="monotone"
            dataKey="rothBalance"
            name="Roth Balance"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />
          {/* Account Value - red dashed */}
          <Line
            type="monotone"
            dataKey="accountValue"
            name="Account Value"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />
          {/* Income Base - green dotted */}
          <Line
            type="monotone"
            dataKey="incomeBase"
            name="Income Base"
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="2 4"
            dot={false}
            activeDot={{ r: 5, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
