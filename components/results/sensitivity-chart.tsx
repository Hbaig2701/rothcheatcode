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
} from 'recharts';
import type { SensitivityResult } from '@/lib/calculations/analysis/types';
import {
  transformToSensitivityChartData,
  formatAxisValue,
} from '@/lib/calculations/transforms';
import { SCENARIO_COLORS, formatSensitivitySummary } from '@/lib/calculations/analysis/sensitivity';

interface SensitivityChartProps {
  result: SensitivityResult;
}

/**
 * Custom tooltip for sensitivity chart
 * Shows all scenario values at the hovered age
 */
function SensitivityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-2">Age {label}</p>
      <div className="space-y-1">
        {payload
          .sort((a: any, b: any) => b.value - a.value)
          .map((entry: any) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.stroke }}
                />
                <span className="text-muted-foreground">{entry.dataKey}</span>
              </div>
              <span className="font-medium">
                {(entry.value / 100).toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

/**
 * Multi-scenario sensitivity fan chart
 * Displays all 7 scenarios with Base Case emphasized
 */
export function SensitivityChart({ result }: SensitivityChartProps) {
  const chartData = transformToSensitivityChartData(result);
  const summary = formatSensitivitySummary(result);
  const scenarioNames = Object.keys(result.scenarios);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground block">Breakeven Range</span>
          <span className="font-medium">{summary.breakEvenRange}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Ending Wealth Range</span>
          <span className="font-medium">{summary.wealthRange}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Best Scenario</span>
          <span className="font-medium text-green-600">{summary.bestCase}</span>
        </div>
        <div>
          <span className="text-muted-foreground block">Worst Scenario</span>
          <span className="font-medium text-red-600">{summary.worstCase}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
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
              width={80}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<SensitivityTooltip />} />
            <Legend
              verticalAlign="top"
              height={48}
              wrapperStyle={{ paddingBottom: 10 }}
            />

            {/* Render lines for each scenario */}
            {scenarioNames.map(name => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name}
                stroke={SCENARIO_COLORS[name] ?? '#A0A0A0'}
                strokeWidth={name === 'Base Case' ? 3 : 1.5}
                strokeDasharray={
                  name === 'Pessimistic' || name === 'Optimistic'
                    ? '5 5'
                    : undefined
                }
                dot={false}
                activeDot={{ r: name === 'Base Case' ? 6 : 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend explanation */}
      <div className="text-xs text-muted-foreground">
        <p>
          <strong>Base Case</strong> uses {result.scenarios['Base Case'] ? '6%' : 'default'} growth.
          {' '}Pessimistic/Optimistic scenarios are shown with dashed lines.
        </p>
      </div>
    </div>
  );
}
