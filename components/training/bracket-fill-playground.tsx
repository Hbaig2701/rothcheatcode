'use client';

/**
 * Module 2 playground — bracket-fill visualization.
 *
 * Slider on Bob's conversion amount. Below it, a stack of horizontal
 * bracket bars: each shows how much of his taxable income landed in
 * that bracket and the tax owed for that slice. Marginal and effective
 * rates float above the chart. Lets the advisor SEE that brackets are
 * layers, not labels.
 */

import { useEffect, useMemo, useState } from 'react';
import { simulate, type TrainingSimResult } from '@/lib/training/simulate';
import { buildBracketFill, marginalRate, effectiveRate, type BracketFill } from '@/lib/training/bracket-breakdown';

interface BracketFillPlaygroundProps {
  initial: TrainingSimResult;
}

const STEP = 5_000;
const MIN = 0;
const MAX = 200_000;
const DEFAULT = 50_000;
const TAX_YEAR = new Date().getFullYear();

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

const fmtCompact = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.round(cents / 100));

export function BracketFillPlayground({ initial }: BracketFillPlaygroundProps) {
  const [conversion, setConversion] = useState(DEFAULT);
  const [sim, setSim] = useState<TrainingSimResult>(initial);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (conversion === DEFAULT) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      simulate('bob', {
        conversion_type: 'fixed_amount',
        fixed_conversion_amount: conversion * 100,
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
  }, [conversion]);

  const y0 = sim.strategy[0];
  const taxableIncome = y0.taxableIncome ?? 0;
  const totalIncome = y0.totalIncome ?? 0;
  const standardDeduction = Math.max(0, totalIncome - taxableIncome);

  const fill = useMemo(
    () => buildBracketFill(taxableIncome, 'single', TAX_YEAR),
    [taxableIncome],
  );
  const marginal = marginalRate(fill);
  const effective = effectiveRate(fill, taxableIncome);
  const totalFedTax = fill.reduce((s, b) => s + b.taxInBracket, 0);

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Watch the buckets fill
      </h3>
      <p className="text-sm text-text-dim mb-6">
        Bob has no other income at age 62 — every dollar you convert stacks from the bottom up.
      </p>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="conv-slider-2" className="text-sm font-medium text-foreground">
            Bob converts this much this year
          </label>
          <span className="text-lg font-display font-semibold text-gold tabular-nums">
            {fmt(conversion * 100)}
          </span>
        </div>
        <input
          id="conv-slider-2"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={conversion}
          onChange={(e) => setConversion(Number(e.target.value))}
          className="w-full accent-gold cursor-pointer"
        />
        <div className="flex justify-between text-xs text-text-dimmer mt-1.5">
          <span>$0</span>
          <span>$100K</span>
          <span>$200K</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Federal tax" value={fmt(totalFedTax)} highlight />
        <Stat label="Marginal rate" value={`${marginal}%`} />
        <Stat label="Effective rate" value={`${effective.toFixed(1)}%`} />
      </div>

      <div className="space-y-2 relative">
        {isLoading && (
          <div className="absolute -top-6 right-0 text-[10px] uppercase tracking-wider text-text-dimmer">
            calculating…
          </div>
        )}
        {standardDeduction > 0 && (
          <BracketRow
            rateLabel="Standard deduction"
            rangeLabel="Not taxed"
            fillPercent={100}
            fillAmount={standardDeduction}
            taxAmount={0}
            isDeduction
          />
        )}
        {fill.map((b) => (
          <BracketRow
            key={b.rate}
            rateLabel={`${b.rate}% bracket`}
            rangeLabel={
              b.upper === Infinity
                ? `${fmtCompact(b.lower)}+`
                : `${fmtCompact(b.lower)} – ${fmtCompact(b.upper)}`
            }
            fillPercent={(b.incomeInBracket / b.bracketWidth) * 100}
            fillAmount={b.incomeInBracket}
            taxAmount={b.taxInBracket}
          />
        ))}
      </div>

      <p className="text-xs text-text-dimmer mt-5 leading-relaxed">
        Each filled bar shows how much of Bob&apos;s taxable income landed in that bracket. The
        marginal rate is the top rate any of his dollars touched; the effective rate is what the
        whole conversion averages out to.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-border-default p-4">
      <div className="text-[10px] uppercase tracking-wider text-text-dimmer mb-1">{label}</div>
      <div
        className={`text-xl font-display font-semibold tabular-nums ${highlight ? 'text-gold' : 'text-foreground'}`}
      >
        {value}
      </div>
    </div>
  );
}

function BracketRow({
  rateLabel,
  rangeLabel,
  fillPercent,
  fillAmount,
  taxAmount,
  isDeduction,
}: {
  rateLabel: string;
  rangeLabel: string;
  fillPercent: number;
  fillAmount: number;
  taxAmount: number;
  isDeduction?: boolean;
}) {
  const clampedFill = Math.min(100, Math.max(0, fillPercent));
  const isEmpty = fillAmount === 0;

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-medium ${isEmpty ? 'text-text-dimmer' : 'text-foreground'}`}>
            {rateLabel}
          </span>
          <span className="text-text-dimmer">{rangeLabel}</span>
        </div>
        {!isDeduction && (
          <span className={`tabular-nums ${isEmpty ? 'text-text-dimmer' : 'text-text-dim'}`}>
            {fillAmount > 0 ? `${fmt(fillAmount)} → ${fmt(taxAmount)} tax` : '—'}
          </span>
        )}
        {isDeduction && (
          <span className="tabular-nums text-text-dim">
            {fmt(fillAmount)}
          </span>
        )}
      </div>
      <div className="relative h-5 rounded-[6px] bg-bg-input border border-border-default overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${
            isDeduction ? 'bg-text-dimmer/30' : 'bg-gold/40'
          }`}
          style={{ width: `${clampedFill}%` }}
        />
      </div>
    </div>
  );
}
