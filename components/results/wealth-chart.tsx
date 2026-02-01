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
            stroke="#1F1F1F"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="age"
            label={{
              value: 'Age',
              position: 'bottom',
              offset: 0,
              fill: '#6B6B6B',
              fontSize: 12,
            }}
            tick={{ fontSize: 11, fill: '#6B6B6B' }}
            tickLine={{ stroke: '#2A2A2A' }}
            axisLine={{ stroke: '#2A2A2A' }}
          />
          <YAxis
            tickFormatter={formatAxisValue}
            width={65}
            tick={{ fontSize: 11, fill: '#6B6B6B' }}
            tickLine={{ stroke: '#2A2A2A' }}
            axisLine={{ stroke: '#2A2A2A' }}
            domain={[0, 'auto']}
          />
          <Tooltip content={<ChartTooltip />} />
          {/* Blueprint line - gold (Roth = no heir tax = higher wealth) */}
          <Line
            type="monotone"
            dataKey="blueprint"
            name="Blueprint Wealth Trajectory"
            stroke="#F5B800"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, fill: '#F5B800', stroke: '#fff', strokeWidth: 2 }}
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
