'use client';

/**
 * Module 6 playground - widow penalty.
 *
 * Two parallel simulations of Mary:
 *   - MFJ throughout (George never dies) - the counterfactual.
 *   - Single filer from year 1 (widow) - survivor SS only, single brackets.
 *
 * Slider on Mary's age picks a year. Side-by-side comparison shows that
 * even though the widow has LESS total income (lost spouse SS), the tax
 * bill is often HIGHER because single brackets are roughly half as wide
 * as MFJ brackets. Widow penalty callout = the difference.
 */

import { useEffect, useMemo, useState } from 'react';
import type { TrainingSimResult } from '@/lib/training/simulate';

interface WidowPenaltyPlaygroundProps {
  initialMfj: TrainingSimResult;
  initialWidow: TrainingSimResult;
}

const MIN_AGE = 70;
const MAX_AGE = 92;
const DEFAULT_AGE = 80;

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

export function WidowPenaltyPlayground({ initialMfj, initialWidow }: WidowPenaltyPlaygroundProps) {
  const [age, setAge] = useState(DEFAULT_AGE);
  const [mfj] = useState(initialMfj);
  const [widow] = useState(initialWidow);

  // The simulations themselves don't depend on the slider - only the year
  // the advisor inspects does. That keeps interaction instant (no engine
  // call per slide) while still demonstrating the concept perfectly.
  const mfjYear = useMemo(() => mfj.baseline.find((y) => y.age === age), [mfj, age]);
  const widowYear = useMemo(() => widow.baseline.find((y) => y.age === age), [widow, age]);

  if (!mfjYear || !widowYear) return null;

  const widowPenalty = widowYear.totalTax - mfjYear.totalTax;
  const incomeDelta = mfjYear.totalIncome - widowYear.totalIncome;

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Same year, two realities
      </h3>
      <p className="text-sm text-text-dim mb-6">
        On the left: Mary&apos;s tax bill if George were still alive (MFJ filers, both Social
        Security checks). On the right: Mary as a widow (single filer, survivor SS only). Move
        the slider to see how the gap evolves over the years after a death.
      </p>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="age-slider-6" className="text-sm font-medium text-foreground">
            Inspect year - Mary&apos;s age
          </label>
          <span className="text-lg font-semibold text-gold tabular-nums">{age}</span>
        </div>
        <input
          id="age-slider-6"
          type="range"
          min={MIN_AGE}
          max={MAX_AGE}
          step={1}
          value={age}
          onChange={(e) => setAge(Number(e.target.value))}
          className="w-full accent-gold cursor-pointer"
        />
        <div className="flex justify-between text-xs text-text-dimmer mt-1.5">
          <span>{MIN_AGE}</span>
          <span>80</span>
          <span>{MAX_AGE}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="rounded-[10px] border border-border-default p-5">
          <div className="text-xs uppercase tracking-wider text-text-dimmer mb-3">
            If MFJ (both alive)
          </div>
          <div className="space-y-2.5">
            <Row label="Total income" value={fmt(mfjYear.totalIncome)} />
            <Row label="Marginal bracket" value={`${mfjYear.federalTaxBracket ?? 0}%`} />
            <Row label="Federal tax" value={fmt(mfjYear.federalTax)} />
            <Row label="Total tax (fed + state + IRMAA)" value={fmt(mfjYear.totalTax)} />
          </div>
        </div>

        <div className="rounded-[10px] border border-gold-border bg-accent/40 p-5">
          <div className="text-xs uppercase tracking-wider text-gold mb-3">As widow (single filer)</div>
          <div className="space-y-2.5">
            <Row label="Total income" value={fmt(widowYear.totalIncome)} muted={incomeDelta > 0} />
            <Row label="Marginal bracket" value={`${widowYear.federalTaxBracket ?? 0}%`} highlight />
            <Row label="Federal tax" value={fmt(widowYear.federalTax)} />
            <Row label="Total tax (fed + state + IRMAA)" value={fmt(widowYear.totalTax)} highlight />
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border border-gold-border bg-accent/40 p-5 text-center">
        <div className="text-xs uppercase tracking-wider text-gold mb-1">Widow penalty</div>
        <div className="text-3xl font-bold text-gold tabular-nums mb-1">
          {widowPenalty >= 0 ? '+' : ''}{fmt(widowPenalty)}
        </div>
        <div className="text-xs text-text-dim">
          Extra tax this year despite{' '}
          <span className="font-semibold text-foreground">{fmt(incomeDelta)}</span> LESS income
          {' '}than the MFJ scenario.
        </div>
      </div>

      <p className="text-xs text-text-dimmer mt-4 leading-relaxed">
        The widow has less income (no spouse SS) but pays more tax. That&apos;s bracket
        compression in action: single brackets are roughly half as wide as MFJ brackets, so the
        same RMD-driven income hits much higher rates as a single filer.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-sm ${muted ? 'text-text-dimmer' : 'text-text-dim'}`}>{label}</span>
      <span
        className={`text-base font-semibold tabular-nums ${
          muted ? 'text-text-dimmer' : highlight ? 'text-gold' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
