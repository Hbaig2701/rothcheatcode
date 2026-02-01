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
  ReferenceArea,
} from 'recharts';
import { ChartTooltip } from './chart-tooltip';
import type { ChartDataPoint } from '@/lib/calculations/transforms';
import type { BreakEvenAnalysis, CrossoverPoint } from '@/lib/calculations/analysis/types';
import { formatAxisValue } from '@/lib/calculations/transforms';

interface BreakevenChartProps {
  data: ChartDataPoint[];
  analysis: BreakEvenAnalysis;
}

/**
 * Get color for crossover marker based on direction
 */
function getCrossoverColor(direction: CrossoverPoint['direction']): string {
  return direction === 'cheatCode_ahead' ? '#F5B800' : '#ef4444'; // gold or red
}

/**
 * Enhanced breakeven chart showing:
 * - Baseline vs CheatCode wealth lines
 * - All crossover points marked
 * - Sustained breakeven highlighted
 * - Net benefit annotation
 */
export function BreakevenChart({ data, analysis }: BreakevenChartProps) {
  const {
    simpleBreakEven,
    sustainedBreakEven,
    crossoverPoints,
    netBenefit,
  } = analysis;

  // Format net benefit for display
  const netBenefitFormatted = (netBenefit / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  const isPositive = netBenefit > 0;

  return (
    <div className="space-y-2">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-4 text-sm mb-4">
        {simpleBreakEven && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">First Breakeven:</span>
            <span className="font-medium">Age {simpleBreakEven}</span>
          </div>
        )}
        {sustainedBreakEven && sustainedBreakEven !== simpleBreakEven && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sustained Breakeven:</span>
            <span className="font-medium text-green-600">Age {sustainedBreakEven}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Net Benefit:</span>
          <span className={`font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{netBenefitFormatted}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[400px] w-full">
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
            <Legend verticalAlign="top" height={36} />

            {/* Baseline line - red dashed */}
            <Line
              type="monotone"
              dataKey="baseline"
              name="Baseline (No Conversion)"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 6 }}
            />

            {/* CheatCode line - gold */}
            <Line
              type="monotone"
              dataKey="cheatCode"
              name="CheatCode (Roth Conversion)"
              stroke="#F5B800"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
            />

            {/* Sustained breakeven marker - green dashed line (priority) */}
            {sustainedBreakEven && (
              <ReferenceLine
                x={sustainedBreakEven}
                stroke="#F5B800"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Sustained: Age ${sustainedBreakEven}`,
                  position: 'top',
                  fill: '#F5B800',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
            )}

            {/* Additional crossover markers (if any beyond sustained) */}
            {crossoverPoints
              .filter(p => p.age !== sustainedBreakEven)
              .slice(0, 3) // Limit to avoid clutter
              .map((point, idx) => (
                <ReferenceLine
                  key={`crossover-${idx}`}
                  x={point.age}
                  stroke={getCrossoverColor(point.direction)}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
              ))}

            {/* Shade area where cheatCode is ahead (if sustained breakeven exists) */}
            {sustainedBreakEven && data.length > 0 && (
              <ReferenceArea
                x1={sustainedBreakEven}
                x2={data[data.length - 1].age}
                fill="#F5B800"
                fillOpacity={0.1}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Crossover legend */}
      {crossoverPoints.length > 1 && (
        <div className="text-xs text-muted-foreground mt-2">
          <span className="font-medium">{crossoverPoints.length} crossover points detected.</span>
          {' '}The lines cross multiple times before the sustained breakeven.
        </div>
      )}
    </div>
  );
}
