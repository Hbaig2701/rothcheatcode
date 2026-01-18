'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { YearlyResult } from '@/lib/calculations/types';
import { IRMAA_TIERS_2026 } from '@/lib/data/irmaa-brackets';
import { formatCurrency, formatAxisValue } from '@/lib/calculations/transforms';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

interface IRMAAThreshold {
  value: number;
  label: string;
  color: string;
}

/**
 * Get IRMAA tier thresholds with colors for visualization
 * Returns tiers 1-5 (skips tier 0 which is standard/no surcharge)
 */
function getIRMAAThresholds(isJoint: boolean): IRMAAThreshold[] {
  // Colors from green to dark red for increasing severity
  const colors = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#991b1b'];

  // Skip tier 0 (standard), get tiers 1-5
  return IRMAA_TIERS_2026.slice(1).map((tier, index) => ({
    value: isJoint ? tier.jointLower : tier.singleLower,
    label: `Tier ${index + 1}`,
    color: colors[index],
  }));
}

interface IRMAAChartProps {
  years: YearlyResult[];
  filingStatus: string;
}

/**
 * IRMAA Income Visualization Chart
 * Displays MAGI (total income) as bars with horizontal reference lines
 * showing IRMAA tier thresholds to help advisors visualize cliff risk
 */
export function IRMAAChart({ years, filingStatus }: IRMAAChartProps) {
  const isJoint = filingStatus === 'married_filing_jointly';
  const thresholds = getIRMAAThresholds(isJoint);

  // Transform data for chart - extract age and totalIncome (proxy for MAGI)
  const chartData = years.map((year) => ({
    age: year.age,
    year: year.year,
    magi: year.totalIncome,
  }));

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ value: number; dataKey: string }>;
    label?: string | number;
  }) => {
    if (active && payload && payload.length) {
      const data = chartData.find(d => d.age === label);
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-lg">
          <p className="font-medium">Age {label}</p>
          {data && <p className="text-muted-foreground text-sm">Year {data.year}</p>}
          <p className="text-blue-600 font-medium mt-1">
            MAGI: {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>IRMAA Income Thresholds</CardTitle>
        <CardDescription>
          Modified Adjusted Gross Income relative to Medicare premium surcharge tiers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 80, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="age"
                tick={{ fontSize: 12 }}
                label={{ value: 'Age', position: 'insideBottom', offset: -10 }}
              />
              <YAxis
                tickFormatter={formatAxisValue}
                tick={{ fontSize: 12 }}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="magi"
                fill="#3b82f6"
                name="MAGI"
                radius={[2, 2, 0, 0]}
              />
              {thresholds.map((threshold) => (
                <ReferenceLine
                  key={threshold.label}
                  y={threshold.value}
                  stroke={threshold.color}
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: threshold.label,
                    position: 'right',
                    fill: threshold.color,
                    fontSize: 11,
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Threshold legend */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            IRMAA Tier Thresholds ({isJoint ? 'Married Filing Jointly' : 'Single'})
          </p>
          <div className="flex flex-wrap gap-4">
            {thresholds.map((threshold) => (
              <div key={threshold.label} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: threshold.color }}
                />
                <span className="text-sm">
                  {threshold.label}: {formatCurrency(threshold.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
