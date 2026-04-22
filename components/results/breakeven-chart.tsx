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
import type { BreakEvenAnalysis } from '@/lib/calculations/analysis/types';
import { formatAxisValue } from '@/lib/calculations/transforms';

interface BreakevenChartProps {
  analysis: BreakEvenAnalysis;
}

/**
 * Tax-Payback chart for the Advanced Analysis section.
 *
 * Plots cumulative tax paid year-by-year for each scenario:
 *   - Baseline (no conversion): grows linearly as RMDs get taxed every year
 *   - Strategy (Roth conversion): jumps up front (the conversion tax),
 *     then grows very slowly because Roth distributions aren't taxable
 *
 * They cross at the "payback age" — the year the strategy's annual tax
 * savings have repaid the upfront conversion tax. That's what advisors and
 * clients mean by "breakeven": when does this investment pay for itself.
 */
export function BreakevenChart({ analysis }: BreakevenChartProps) {
  const {
    simpleBreakEven,
    sustainedBreakEven,
    netBenefit,
    taxPaybackData,
  } = analysis;

  // Map the analysis points into chart-ready rows. Recharts wants flat
  // numeric props per row (we already have them).
  const data = taxPaybackData.map(p => ({
    age: p.age,
    baseline: p.baselineCumulativeTax,
    strategy: p.strategyCumulativeTax,
  }));

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
        {simpleBreakEven ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tax Payback Age:</span>
            <span className="font-medium">{simpleBreakEven}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tax Payback:</span>
            <span className="font-medium text-amber-600">Not reached in projection</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Lifetime Tax Savings:</span>
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
              label={{
                value: 'Cumulative Tax Paid',
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fontSize: 12 },
              }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend verticalAlign="top" height={36} />

            {/* Baseline cumulative tax — red dashed (the "do nothing" cost trajectory) */}
            <Line
              type="monotone"
              dataKey="baseline"
              name="Baseline Cumulative Tax (No Conversion)"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 6 }}
            />

            {/* Strategy cumulative tax — gold (jumps up front, then flattens) */}
            <Line
              type="monotone"
              dataKey="strategy"
              name="Strategy Cumulative Tax (Roth Conversion)"
              stroke="#F5B800"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
            />

            {/* Payback age marker */}
            {sustainedBreakEven && (
              <ReferenceLine
                x={sustainedBreakEven}
                stroke="#F5B800"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Payback: Age ${sustainedBreakEven}`,
                  position: 'top',
                  fill: '#F5B800',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              />
            )}

            {/* Shade the region after payback to emphasize "savings phase" */}
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

      {/* How to read this */}
      <p className="text-xs text-muted-foreground mt-2">
        The Strategy line jumps up front (conversion tax paid in year 1), then grows slowly.
        The Baseline line grows steadily as RMDs are taxed every year. They cross at the payback age,
        when the strategy&apos;s cumulative tax matches the baseline&apos;s — that&apos;s when the upfront tax cost
        has been fully repaid through annual savings.
      </p>
    </div>
  );
}
