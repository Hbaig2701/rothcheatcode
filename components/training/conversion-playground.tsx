'use client';

/**
 * Module 1 playground — "What a Roth Conversion Actually Is".
 *
 * One slider (conversion amount), three live numbers (federal tax this
 * year, Roth balance end of year 1, Traditional balance end of year 1)
 * + a tiny baseline comparison so the advisor can see exactly what
 * changes when Bob converts vs. doesn't.
 *
 * Runs against the real engine via the simulate server action. Slider
 * drags are debounced 150ms to keep the simulation count sane.
 */

import { useEffect, useMemo, useState } from 'react';
import { simulate, type TrainingSimResult } from '@/lib/training/simulate';

interface PlaygroundResult {
  federalTax: number;
  totalTax: number;
  rothBalance: number;
  traditionalBalance: number;
}

interface ConversionPlaygroundProps {
  /**
   * Server-rendered initial result (year 1 of strategy at the default
   * slider value), so the first paint shows real numbers instead of a
   * loading shimmer.
   */
  initial: TrainingSimResult;
  /**
   * Server-rendered "do nothing" baseline (year 1) for the comparison
   * column. Stays static — only the converting side moves with the slider.
   */
  baseline: TrainingSimResult;
}

const STEP_DOLLARS = 5_000;
const MIN_DOLLARS = 0;
const MAX_DOLLARS = 200_000;
const DEFAULT_DOLLARS = 50_000;

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

function pickResult(sim: TrainingSimResult): PlaygroundResult {
  const y = sim.strategy[0];
  return {
    federalTax: y.federalTax,
    totalTax: y.totalTax,
    rothBalance: y.rothBalance,
    traditionalBalance: y.traditionalBalance,
  };
}

export function ConversionPlayground({ initial, baseline }: ConversionPlaygroundProps) {
  const [conversion, setConversion] = useState(DEFAULT_DOLLARS);
  const [result, setResult] = useState<PlaygroundResult>(() => pickResult(initial));
  const [isLoading, setIsLoading] = useState(false);

  const baselineResult = useMemo(() => pickResult(baseline), [baseline]);

  useEffect(() => {
    if (conversion === DEFAULT_DOLLARS) {
      // Initial result already covers the default — skip the round trip.
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      simulate('bob', {
        conversion_type: 'fixed_amount',
        fixed_conversion_amount: conversion * 100, // dollars → cents
      })
        .then((sim) => {
          if (cancelled) return;
          setResult(pickResult(sim));
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

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Move the slider — watch Bob&apos;s accounts shift
      </h3>
      <p className="text-sm text-text-dim mb-6">
        These numbers come from the real Retirement Expert engine, not a hard-coded animation.
        Same calculation that would run if Bob were a real client.
      </p>

      <div className="mb-8">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="conversion-slider" className="text-sm font-medium text-foreground">
            Convert this much from Bob&apos;s Traditional IRA this year
          </label>
          <span className="text-lg font-display font-semibold text-gold tabular-nums">
            {fmt(conversion * 100)}
          </span>
        </div>
        <input
          id="conversion-slider"
          type="range"
          min={MIN_DOLLARS}
          max={MAX_DOLLARS}
          step={STEP_DOLLARS}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-border-default p-5">
          <div className="text-xs uppercase tracking-wider text-text-dimmer mb-3">If Bob does nothing</div>
          <div className="space-y-2.5">
            <Row label="Federal tax this year" value={fmt(baselineResult.federalTax)} muted />
            <Row label="Traditional IRA, year-end" value={fmt(baselineResult.traditionalBalance)} muted />
            <Row label="Roth IRA, year-end" value={fmt(baselineResult.rothBalance)} muted />
          </div>
        </div>

        <div className="rounded-[10px] border border-gold-border bg-accent/40 p-5 relative">
          {isLoading && (
            <div className="absolute top-3 right-3 text-[10px] uppercase tracking-wider text-text-dimmer">
              calculating…
            </div>
          )}
          <div className="text-xs uppercase tracking-wider text-gold mb-3">
            If Bob converts {fmt(conversion * 100)}
          </div>
          <div className="space-y-2.5">
            <Row label="Federal tax this year" value={fmt(result.federalTax)} highlight />
            <Row label="Traditional IRA, year-end" value={fmt(result.traditionalBalance)} />
            <Row label="Roth IRA, year-end" value={fmt(result.rothBalance)} highlight />
          </div>
        </div>
      </div>

      <p className="text-xs text-text-dimmer mt-5 leading-relaxed">
        Notice: the conversion amount you slide leaves the Traditional IRA and shows up in the Roth.
        That&apos;s the whole mechanic. The federal tax above is the cost of doing it. (Tax payment
        is assumed from outside funds — see Module 3 for what changes if Bob pays from inside the IRA.)
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
        className={`text-lg font-display font-semibold tabular-nums ${
          muted ? 'text-text-dim' : highlight ? 'text-gold' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
