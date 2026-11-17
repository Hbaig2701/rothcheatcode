'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

const TIER_COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#991b1b'];
const TIER_KEYS = ['t1', 't2', 't3', 't4', 't5'] as const;
// Same indexing the engine uses (lib/data/irmaa-brackets.ts getIRMAATier):
// 2026 thresholds grown 2.5%/yr, rounded to the dollar.
const IRMAA_INFLATION_RATE = 0.025;

function tierLowers(isJoint: boolean, year: number): number[] {
  const factor = year > 2026 ? Math.pow(1 + IRMAA_INFLATION_RATE, year - 2026) : 1;
  return IRMAA_TIERS_2026.slice(1).map((tier) =>
    Math.round((isJoint ? tier.jointLower : tier.singleLower) * factor / 100) * 100,
  );
}

interface IRMAAChartRow {
  age: number;
  year: number;
  isJoint: boolean;
  magi: number;
  t1: number; t2: number; t3: number; t4: number; t5: number;
}

function IRMAATooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: IRMAAChartRow }>;
}) {
  const data = active ? payload?.[0]?.payload : undefined;
  if (!data) return null;
  return (
    <div className="bg-card border border-border p-3 rounded-lg shadow-lg">
      <p className="font-medium">Age {data.age}</p>
      <p className="text-muted-foreground text-sm">Year {data.year}</p>
      <p className="text-[#F5B800] font-medium mt-1">MAGI: {formatCurrency(data.magi)}</p>
      <p className="text-muted-foreground text-xs mt-1">
        Tier 1 starts at {formatCurrency(data.t1)} ({data.isJoint ? 'joint' : 'single'}, premium year {data.year + 2})
      </p>
    </div>
  );
}

interface IRMAAChartProps {
  years: YearlyResult[];
  filingStatus: string;
}

/**
 * IRMAA Income Visualization Chart
 * Bars: each year's MAGI. Step lines: the IRMAA tier thresholds that MAGI is
 * judged against. Medicare looks back 2 years, so year Y's income sets the
 * premium in Y+2 — the line under each bar is the Y+2 threshold, indexed the
 * same way the engine indexes it, for the filing status on year Y's return
 * (Single after the first death when widow modeling is on).
 */
export function IRMAAChart({ years, filingStatus }: IRMAAChartProps) {
  const chartData: IRMAAChartRow[] = years.map((year) => {
    const isJoint = (year.filingStatus ?? filingStatus) === 'married_filing_jointly';
    const lowers = tierLowers(isJoint, year.year + 2);
    return {
      age: year.age,
      year: year.year,
      isJoint,
      // MAGI = AGI + tax-exempt interest (what IRMAA uses). totalIncome counts
      // gross Social Security and overstates it; fall back only for old rows.
      magi: year.magi ?? year.totalIncome,
      t1: lowers[0], t2: lowers[1], t3: lowers[2], t4: lowers[3], t5: lowers[4],
    };
  });
  const first = chartData[0];
  const switchRow = chartData.find((d) => first && d.isJoint !== first.isJoint);

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
            <ComposedChart data={chartData} margin={{ top: 20, right: 80, left: 20, bottom: 20 }}>
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
              <Tooltip content={<IRMAATooltip />} />
              <Bar
                dataKey="magi"
                fill="#F5B800"
                name="MAGI"
                radius={[2, 2, 0, 0]}
              />
              {TIER_KEYS.map((key, i) => (
                <Line
                  key={key}
                  dataKey={key}
                  name={`Tier ${i + 1}`}
                  type="stepAfter"
                  stroke={TIER_COLORS[i]}
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Threshold legend */}
        {first && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              IRMAA tier thresholds for {first.year}&apos;s income ({first.isJoint ? 'Married Filing Jointly' : 'Single'}; premium year {first.year + 2}). Lines rise 2.5%/yr with indexing.
            </p>
            <div className="flex flex-wrap gap-4">
              {TIER_KEYS.map((key, i) => (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TIER_COLORS[i] }} />
                  <span className="text-sm">Tier {i + 1}: {formatCurrency(first[key])}</span>
                </div>
              ))}
            </div>
            {switchRow && (
              <p className="text-xs text-muted-foreground mt-2">
                From {switchRow.year} (age {switchRow.age}) the survivor files {switchRow.isJoint ? 'jointly' : 'Single'}, so the lines drop to the {switchRow.isJoint ? 'joint' : 'single'} thresholds.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
