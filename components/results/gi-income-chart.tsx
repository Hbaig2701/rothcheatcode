'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { formatAxisValue } from '@/lib/calculations/transforms';

interface IncomeDataPoint {
  age: number;
  year: number;
  strategyNet: number;        // Cumulative tax-free income (cents)
  baselineNet: number;        // Cumulative after-tax income (cents)
  strategyAnnual: number;     // Annual income (for tooltip)
  baselineAnnual: number;     // Annual baseline income (for tooltip)
  phase: 'conversion' | 'deferral' | 'income';
}

interface GIIncomeChartProps {
  data: IncomeDataPoint[];
  breakEvenAge: number | null;
  incomeStartAge: number;
}

// Currency formatter for tooltip
const toUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

// Custom tooltip component
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const advantage = data.strategyNet - data.baselineNet;
  const isIncomePhase = data.phase === 'income';

  return (
    <div className="bg-[rgba(12,12,12,0.95)] border border-[rgba(255,255,255,0.1)] rounded-lg p-4 shadow-xl">
      <p className="text-sm font-medium text-white mb-3">Age {label}</p>

      {isIncomePhase ? (
        <>
          <div className="space-y-2 mb-3">
            <div className="flex justify-between gap-6">
              <span className="text-sm text-[rgba(255,255,255,0.5)]">Strategy (tax-free)</span>
              <span className="text-sm font-mono text-[#4ade80]">{toUSD(data.strategyNet)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-sm text-[rgba(255,255,255,0.5)]">Baseline (after-tax)</span>
              <span className="text-sm font-mono text-[rgba(255,255,255,0.6)]">{toUSD(data.baselineNet)}</span>
            </div>
          </div>
          <div className="pt-2 border-t border-[rgba(255,255,255,0.1)]">
            <div className="flex justify-between gap-6">
              <span className="text-sm font-medium text-gold">Your Advantage</span>
              <span className="text-sm font-mono font-medium text-gold">+{toUSD(advantage)}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-[rgba(255,255,255,0.5)]">
          {data.phase === 'conversion' ? 'Converting to Roth...' : 'Income Base growing...'}
        </p>
      )}
    </div>
  );
}

export function GIIncomeChart({ data, breakEvenAge, incomeStartAge }: GIIncomeChartProps) {
  // Find the break-even data point for the marker
  const breakEvenPoint = breakEvenAge ? data.find(d => d.age === breakEvenAge) : null;

  // Find max values for domain
  const maxValue = Math.max(
    ...data.map(d => Math.max(d.strategyNet, d.baselineNet))
  );

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <defs>
            {/* Gradient for strategy area */}
            <linearGradient id="strategyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#4ade80" stopOpacity={0.05} />
            </linearGradient>
            {/* Gradient for baseline area */}
            <linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.2)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="rgba(255,255,255,0.1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

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

          <Tooltip content={<CustomTooltip />} />

          {/* Income start age reference line */}
          <ReferenceLine
            x={incomeStartAge}
            stroke="rgba(212,175,55,0.3)"
            strokeDasharray="4 4"
            label={{
              value: 'Income Starts',
              position: 'top',
              fill: 'rgba(212,175,55,0.7)',
              fontSize: 10,
            }}
          />

          {/* Baseline area (behind) */}
          <Area
            type="monotone"
            dataKey="baselineNet"
            name="Baseline (after-tax)"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="url(#baselineGradient)"
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />

          {/* Strategy area (front) */}
          <Area
            type="monotone"
            dataKey="strategyNet"
            name="Strategy (tax-free)"
            stroke="#4ade80"
            strokeWidth={3}
            fill="url(#strategyGradient)"
            isAnimationActive={true}
            animationDuration={1200}
            animationEasing="ease-out"
          />

          {/* Break-even marker */}
          {breakEvenAge && breakEvenPoint && (
            <ReferenceDot
              x={breakEvenAge}
              y={breakEvenPoint.strategyNet}
              r={6}
              fill="#F5B800"
              stroke="#fff"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
