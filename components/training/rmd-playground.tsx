'use client';

/**
 * Module 4 playground — RMDs.
 *
 * Stacked bar chart showing Mary's annual income trajectory from age 70
 * to her end-age. Each bar splits Social Security + other ordinary
 * income (gray) from the Required Minimum Distribution (gold). RMDs
 * start at 73 and grow as the IRS distribution period shrinks each year.
 *
 * Slider: Mary's starting IRA balance ($500K–$1.5M). Bigger IRAs mean
 * bigger RMD bars, which is the whole lesson — RMD pressure scales with
 * portfolio size, and at the larger end pushes Mary into brackets she'd
 * never otherwise see.
 *
 * Widow analysis is disabled in this module's overrides so the chart
 * isolates RMD growth from filing-status compression (Module 6 covers
 * the widow penalty separately).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { simulate } from '@/lib/training/simulate-action';
import type { TrainingSimResult } from '@/lib/training/simulate';

interface RmdPlaygroundProps {
  initial: TrainingSimResult;
}

const MIN_BALANCE = 500_000;
const MAX_BALANCE = 1_500_000;
const STEP = 50_000;
const DEFAULT_BALANCE = 750_000;

const fmtCompact = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.round(cents / 100));

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

interface ChartRow {
  age: number;
  otherIncome: number; // dollars (for axis readability)
  rmd: number;
  marginalBracket: number;
  totalTax: number;
}

function buildChartData(sim: TrainingSimResult): ChartRow[] {
  // Baseline (no-conversion) is the right surface here: we want to show
  // what happens if Mary does NOTHING about RMDs.
  return sim.baseline
    .filter((y) => y.age >= 70)
    .map((y) => ({
      age: y.age,
      otherIncome: Math.round((y.totalIncome - (y.rmdAmount ?? 0)) / 100),
      rmd: Math.round((y.rmdAmount ?? 0) / 100),
      marginalBracket: y.federalTaxBracket ?? 0,
      totalTax: y.totalTax,
    }));
}

export function RmdPlayground({ initial }: RmdPlaygroundProps) {
  const [balance, setBalance] = useState(DEFAULT_BALANCE);
  const [sim, setSim] = useState(initial);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (balance === DEFAULT_BALANCE) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      simulate('mary', {
        qualified_account_value: balance * 100,
        widow_analysis: false,
        widow_death_age: null,
        conversion_type: 'no_conversion',
      })
        .then((r) => {
          if (!cancelled) setSim(r);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [balance]);

  const data = useMemo(() => buildChartData(sim), [sim]);

  const ageMilestone = data.find((d) => d.age === 80) ?? data.find((d) => d.age === 78);
  const ageEnd = data[data.length - 1];

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Watch RMDs grow as Mary ages
      </h3>
      <p className="text-sm text-text-dim mb-6">
        Gold = the IRS-required distribution. Gray = Mary&apos;s Social Security and other
        ordinary income. The gold stack grows even though her balance is being depleted — that&apos;s
        the IRS&apos;s shrinking distribution period at work.
      </p>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="bal-slider-4" className="text-sm font-medium text-foreground">
            Mary&apos;s IRA balance at age 70
          </label>
          <span className="text-lg font-display font-semibold text-gold tabular-nums">
            {fmtCompact(balance * 100)}
          </span>
        </div>
        <input
          id="bal-slider-4"
          type="range"
          min={MIN_BALANCE}
          max={MAX_BALANCE}
          step={STEP}
          value={balance}
          onChange={(e) => setBalance(Number(e.target.value))}
          className="w-full accent-gold cursor-pointer"
        />
        <div className="flex justify-between text-xs text-text-dimmer mt-1.5">
          <span>$500K</span>
          <span>$1M</span>
          <span>$1.5M</span>
        </div>
      </div>

      <div className="h-[320px] w-full mb-4 relative">
        {isLoading && (
          <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wider text-text-dimmer z-10">
            calculating…
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#666" strokeOpacity={0.2} vertical={false} />
            <XAxis
              dataKey="age"
              stroke="#999"
              tick={{ fontSize: 11 }}
              label={{ value: 'Age', position: 'insideBottom', offset: -10, style: { fill: '#999', fontSize: 11 } }}
            />
            <YAxis
              stroke="#999"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(20,20,20,0.95)',
                border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `$${(typeof value === 'number' ? value : 0).toLocaleString()}`,
                name === 'otherIncome' ? 'SS + other' : 'RMD',
              ]}
              labelFormatter={(age) => `Age ${age}`}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
              formatter={(v) => (v === 'otherIncome' ? 'SS + other' : 'RMD')}
            />
            <Bar dataKey="otherIncome" stackId="a" fill="#666" radius={[0, 0, 0, 0]} />
            <Bar dataKey="rmd" stackId="a" fill="#d4af37" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {ageMilestone && ageEnd && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-[10px] border border-border-default p-4">
            <div className="text-[10px] uppercase tracking-wider text-text-dimmer mb-1">
              At age {ageMilestone.age}
            </div>
            <div className="text-foreground">
              <span className="font-display font-semibold tabular-nums">{fmt(ageMilestone.rmd * 100)}</span>{' '}
              required from the IRA — marginal bracket{' '}
              <span className="font-semibold tabular-nums">{ageMilestone.marginalBracket}%</span>
            </div>
          </div>
          <div className="rounded-[10px] border border-border-default p-4">
            <div className="text-[10px] uppercase tracking-wider text-text-dimmer mb-1">
              At age {ageEnd.age}
            </div>
            <div className="text-foreground">
              <span className="font-display font-semibold tabular-nums">{fmt(ageEnd.rmd * 100)}</span>{' '}
              required — total tax{' '}
              <span className="font-semibold tabular-nums">{fmt(ageEnd.totalTax)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
