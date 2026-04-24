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
import type { BreakEvenAnalysis } from '@/lib/calculations/analysis/types';
import { formatAxisValue, formatCurrency } from '@/lib/calculations/transforms';
import { cn } from '@/lib/utils';

interface BreakevenChartProps {
  analysis: BreakEvenAnalysis;
}

interface PayloadItem { dataKey: string; value: number; }
interface TaxTooltipProps { active?: boolean; payload?: PayloadItem[]; label?: string | number; }

/**
 * Tooltip tailored for the tax-payback chart. The shared ChartTooltip
 * uses dataKey 'formula' (wealth) and labels things "Advantage" — wrong
 * vocabulary for cumulative tax paid. This one says "Tax Paid" and
 * "Savings" so the numbers read sensibly.
 */
function TaxPaybackTooltip({ active, payload, label }: TaxTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const baseline = payload.find(p => p.dataKey === 'baseline');
  const strategy = payload.find(p => p.dataKey === 'strategy');
  const savings = (baseline?.value ?? 0) - (strategy?.value ?? 0);

  return (
    <div className="rounded-lg border border-border-default bg-surface/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="font-semibold text-foreground mb-2">Age {label}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-6">
          <span className="text-[#F5B800] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F5B800]"></span>
            Strategy tax paid:
          </span>
          <span className="font-mono text-foreground">{formatCurrency(strategy?.value ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-red-400 flex items-center gap-2">
            <span className="w-2 h-0.5 bg-red-500"></span>
            Baseline tax paid:
          </span>
          <span className="font-mono text-foreground">{formatCurrency(baseline?.value ?? 0)}</span>
        </div>
        <div className="border-t border-border-default pt-2 mt-2">
          <div className="flex justify-between gap-6">
            <span className="text-[#A0A0A0]">Savings to date:</span>
            <span className={cn(
              'font-mono font-semibold',
              savings >= 0 ? 'text-[#22C55E]' : 'text-red-400',
            )}>
              {savings >= 0 ? '+' : ''}{formatCurrency(savings)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
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
    heirTaxSavings,
    taxPaybackData,
    peakStrategyDeficit,
  } = analysis;

  // Map the analysis points into chart-ready rows. Recharts wants flat
  // numeric props per row (we already have them).
  const data = taxPaybackData.map(p => ({
    age: p.age,
    baseline: p.baselineCumulativeTax,
    strategy: p.strategyCumulativeTax,
  }));

  const isPositive = netBenefit > 0;
  const fmt = (n: number) => (Math.abs(n) / 100).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
  const totalIncludingHeir = netBenefit + heirTaxSavings;

  // Detect "marginal payback" — when cumulative tax curves cross technically
  // but the lifetime savings is trivial relative to the upfront conversion
  // tax cost. Common cause: client is in the same federal bracket during
  // conversion years and RMD years, so there's no real bracket arbitrage
  // and the strategy just shifts when the IRS gets the same dollars. The
  // chart used to call this "Payback Age: 85" with +$630 savings, which
  // misled advisors into thinking the strategy paid back via tax savings —
  // it didn't. The real value for these clients is heir tax avoidance and
  // tax-free Roth growth, which we surface separately.
  // Threshold: savings must exceed max($5K, 10% of upfront deficit). $5K
  // catches absolute trivial cases; 10% catches "I paid $300K upfront and
  // saved $20K — that's not payback" cases.
  const lastAge = data.length > 0 ? data[data.length - 1].age : null;
  const meaningfulSavingsThreshold = Math.max(500_000, peakStrategyDeficit * 0.10);
  const isMarginalPayback =
    simpleBreakEven !== null
    && netBenefit < meaningfulSavingsThreshold
    && peakStrategyDeficit > 0;
  const isLatePayback =
    simpleBreakEven !== null && lastAge !== null
    && simpleBreakEven >= lastAge - 2;

  return (
    <div className="space-y-2">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-4 text-sm mb-4">
        {simpleBreakEven && !isMarginalPayback ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tax Payback Age:</span>
            <span className="font-medium">{simpleBreakEven}</span>
          </div>
        ) : isMarginalPayback ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tax Payback:</span>
            <span className="font-medium text-amber-600">Marginal — no meaningful tax arbitrage</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tax Payback:</span>
            <span className="font-medium text-amber-600">Not reached in projection</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {isPositive ? 'Lifetime Tax Savings:' : 'Net Lifetime Tax Cost:'}
          </span>
          <span className={`font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : '−'}{fmt(netBenefit)}
          </span>
        </div>
        {/* The headline annual-tax savings PLUS the one-time heir-tax savings.
            This number is what the "Total Taxes Paid" stat card on the dashboard
            is comparing across scenarios — surfacing it here so the two
            reconcile at a glance. */}
        {heirTaxSavings > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Including heir tax savings:</span>
            <span className="font-medium text-green-600">+{fmt(totalIncludingHeir)}</span>
          </div>
        )}
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
            <Tooltip content={<TaxPaybackTooltip />} />
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

            {/* Payback age marker — suppressed when payback is marginal so
                we don't visually claim a meaningful breakeven the data doesn't
                actually support (e.g., +$630 savings labeled "Payback Age 85"
                misleads advisors into thinking annual tax arbitrage worked). */}
            {sustainedBreakEven && !isMarginalPayback && (
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

            {/* Shade the region after payback to emphasize "savings phase" —
                also suppressed when marginal, since there's no real savings
                phase to highlight. */}
            {sustainedBreakEven && !isMarginalPayback && data.length > 0 && (
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
        The <span className="text-[#F5B800]">Strategy</span> line jumps up front (conversion tax paid
        in the first few years), then grows slowly. The <span className="text-red-500">Baseline</span>{' '}
        line grows steadily as RMDs are taxed every year.{' '}
        {isMarginalPayback ? (
          <>
            For this client, the strategy&apos;s cumulative tax barely meets the baseline by the end of
            the projection — only {fmt(netBenefit)} of lifetime annual-tax savings on roughly{' '}
            {fmt(peakStrategyDeficit)} of upfront conversion tax. This typically means the client is
            in the <strong>same federal bracket</strong> during conversion years and RMD years, so the
            strategy doesn&apos;t exploit any bracket arbitrage. The strategy&apos;s real value here is
            the heir tax avoidance ({fmt(heirTaxSavings)}) and tax-free Roth growth, not annual tax
            savings — see the Legacy to Heirs chart on the dashboard.
          </>
        ) : sustainedBreakEven ? (
          <>
            They cross at the payback age, when the strategy&apos;s cumulative tax matches the
            baseline&apos;s — that&apos;s when the upfront tax cost has been fully repaid through annual
            savings.{isLatePayback && (
              <> Note: payback occurs near the end of the projection window, so the savings phase
              is short — the strategy&apos;s primary value here may be heir tax avoidance and Roth
              growth rather than annual tax arbitrage.</>
            )}
          </>
        ) : (
          <>
            The projection ends before the baseline&apos;s RMD taxes catch up to the conversion cost,
            so the strategy&apos;s tax payback is not reached within this projection window. The estate-
            planning benefit (Roth passes tax-free to heirs) is reflected on the Legacy to Heirs chart
            on the main dashboard and is a separate consideration.
          </>
        )}
      </p>
    </div>
  );
}
