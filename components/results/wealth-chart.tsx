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
import { ChartTooltip } from './chart-tooltip';
import { type ChartDataPoint, formatAxisValue } from '@/lib/calculations/transforms';

interface WealthChartProps {
  data: ChartDataPoint[];
  breakEvenAge: number | null;
}

export function WealthChart({ data, breakEvenAge }: WealthChartProps) {
  return (
    <div className="h-full w-full">
      {/* CRITICAL: Parent div MUST have explicit height for ResponsiveContainer */}
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
          <Tooltip content={<ChartTooltip />} />
          {/* Blueprint line - green (Roth = no heir tax = higher wealth) */}
          <Line
            type="monotone"
            dataKey="blueprint"
            name="Blueprint Wealth Trajectory"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />
          {/* Baseline line - red dashed (Traditional = heir tax = lower wealth) */}
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline Wealth Trajectory"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
