'use client';

/**
 * Module 5 playground — IRMAA cliff.
 *
 * Slider on the Joneses' conversion amount drives their year-1 MAGI.
 * Below it, a horizontal IRMAA-tier bar visualizes the cliffs: a single
 * dollar over a threshold dumps them into the next tier and the full
 * surcharge kicks in immediately.
 *
 * The advisor sees the surcharge JUMP each time the slider crosses a
 * tier boundary — that discontinuity is the whole point. IRMAA is not
 * graduated like income tax; it's a step function, and crossing a tier
 * by $1 costs the same as crossing it by $40K.
 */

import { useEffect, useMemo, useState } from 'react';
import { simulate, type TrainingSimResult } from '@/lib/training/simulate';
import { IRMAA_TIERS_2026, getIRMAATier } from '@/lib/data/irmaa-brackets';

interface IrmaaPlaygroundProps {
  initial: TrainingSimResult;
}

const MIN = 0;
const MAX = 300_000;
const STEP = 5_000;
const DEFAULT = 50_000;

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

// Visualization runs from $0 MAGI up through the start of Tier 5.
const VIZ_MAX_CENTS = IRMAA_TIERS_2026[5].jointLower; // $750K

const TIER_NAMES = ['Standard', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];

export function IrmaaPlayground({ initial }: IrmaaPlaygroundProps) {
  const [conversion, setConversion] = useState(DEFAULT);
  const [sim, setSim] = useState(initial);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (conversion === DEFAULT) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      simulate('joneses', {
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
  const magi = y0.magi ?? 0;

  const tierData = useMemo(() => {
    const tier = getIRMAATier(magi, true, new Date().getFullYear());
    const idx = IRMAA_TIERS_2026.findIndex((t) => t.jointLower === tier.jointLower);
    return {
      idx,
      name: TIER_NAMES[idx] ?? 'Unknown',
      annualSurcharge: tier.annualSurchargeCouple,
      headroom:
        tier.jointUpper !== Infinity ? tier.jointUpper - magi : Infinity,
      nextThreshold: idx < 5 ? IRMAA_TIERS_2026[idx + 1].jointLower : null,
    };
  }, [magi]);

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Find the cliff edge
      </h3>
      <p className="text-sm text-text-dim mb-6">
        Move the slider through the IRMAA tiers and watch the surcharge step up. The Joneses are
        MFJ, both 65, so both spouses are on Medicare — the surcharge below is the combined
        annual cost.
      </p>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="conv-slider-5" className="text-sm font-medium text-foreground">
            Conversion this year
          </label>
          <span className="text-lg font-display font-semibold text-gold tabular-nums">
            {fmt(conversion * 100)}
          </span>
        </div>
        <input
          id="conv-slider-5"
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
          <span>$150K</span>
          <span>$300K</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6 relative">
        {isLoading && (
          <div className="absolute -top-5 right-0 text-[10px] uppercase tracking-wider text-text-dimmer">
            calculating…
          </div>
        )}
        <Stat label="MAGI this year" value={fmt(magi)} />
        <Stat label="IRMAA tier" value={tierData.name} highlight={tierData.idx > 0} />
        <Stat
          label="Annual surcharge"
          value={fmt(tierData.annualSurcharge)}
          highlight={tierData.annualSurcharge > 0}
        />
      </div>

      <IrmaaTierBar magi={magi} />

      {tierData.nextThreshold !== null && tierData.headroom !== Infinity && tierData.headroom > 0 && (
        <p className="text-xs text-text-dim mt-4 leading-relaxed">
          <strong className="text-foreground">Headroom:</strong> {fmt(tierData.headroom)} more in
          MAGI before crossing into the next IRMAA tier ({fmtCompact(tierData.nextThreshold)} MFJ
          threshold). One dollar over costs the full next-tier surcharge.
        </p>
      )}
      {tierData.idx === 5 && (
        <p className="text-xs text-text-dim mt-4 leading-relaxed">
          <strong className="text-foreground">Top tier reached.</strong> The Joneses are paying
          the maximum IRMAA surcharge — additional MAGI doesn&apos;t change the IRMAA cost from
          here.
        </p>
      )}
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
    <div className={`rounded-[10px] border p-4 ${highlight ? 'border-gold-border bg-accent/40' : 'border-border-default'}`}>
      <div className="text-[10px] uppercase tracking-wider text-text-dimmer mb-1">{label}</div>
      <div
        className={`text-xl font-display font-semibold tabular-nums ${highlight ? 'text-gold' : 'text-foreground'}`}
      >
        {value}
      </div>
    </div>
  );
}

function IrmaaTierBar({ magi }: { magi: number }) {
  const totalWidth = VIZ_MAX_CENTS;
  const magiPercent = Math.min(100, (magi / totalWidth) * 100);

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-text-dimmer mb-2">IRMAA tiers (MFJ)</div>
      <div className="relative h-12 rounded-[8px] overflow-hidden border border-border-default flex">
        {IRMAA_TIERS_2026.slice(0, 6).map((tier, i) => {
          const lower = tier.jointLower;
          const upper = i === 5 ? totalWidth : tier.jointUpper;
          const width = ((upper - lower) / totalWidth) * 100;
          const isCurrent =
            magi >= tier.jointLower &&
            (tier.jointUpper === Infinity || magi < tier.jointUpper);
          const intensity = i / 5; // 0 → 1
          const bgColor = isCurrent
            ? 'rgba(212, 175, 55, 0.45)'
            : `rgba(212, 175, 55, ${0.05 + intensity * 0.12})`;
          return (
            <div
              key={i}
              style={{ width: `${width}%`, backgroundColor: bgColor }}
              className="relative h-full border-r border-border-default last:border-r-0"
            >
              <div className="absolute inset-x-0 top-1 text-center text-[9px] uppercase tracking-wider text-text-dimmer">
                {TIER_NAMES[i]}
              </div>
              <div className="absolute inset-x-0 bottom-1 text-center text-[10px] tabular-nums text-text-dim">
                {i === 5 ? `${fmtCompact(tier.jointLower)}+` : fmtCompact(tier.jointUpper)}
              </div>
            </div>
          );
        })}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground shadow-[0_0_4px_rgba(255,255,255,0.6)]"
          style={{ left: `${magiPercent}%` }}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider text-foreground whitespace-nowrap font-semibold">
            MAGI {fmtCompact(magi)}
          </div>
        </div>
      </div>
    </div>
  );
}
