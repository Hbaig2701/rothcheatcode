'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ChartTooltip } from './chart-tooltip';
import { type ChartDataPoint, formatAxisValue } from '@/lib/calculations/transforms';

interface WealthChartProps {
  data: ChartDataPoint[];
  breakEvenAge: number | null;
}

export function WealthChart({ data, breakEvenAge }: WealthChartProps) {
  return (
    <div className="h-[400px] w-full">
      {/* CRITICAL: Parent div MUST have explicit height for ResponsiveContainer */}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="age"
            label={{ value: 'Age', position: 'insideBottom', offset: -5 }}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tickFormatter={formatAxisValue}
            width={70}
            tick={{ fontSize: 12 }}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
          />
          {/* Baseline line - gray */}
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline (No Conversion)"
            stroke="#6b7280"  // gray-500
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
            isAnimationActive={true}
            animationDuration={1500}
            animationEasing="ease-out"
          />
          {/* Blueprint line - blue (theme color) */}
          <Line
            type="monotone"
            dataKey="blueprint"
            name="Blueprint (Roth Conversion)"
            stroke="#3b82f6"  // blue-500
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
            isAnimationActive={true}
            animationDuration={1500}
            animationEasing="ease-out"
          />

        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
