'use client';

/**
 * Module 3 playground — gross-up.
 *
 * Two simulations side by side: pay conversion tax from outside the IRA
 * vs. pay it from inside the IRA. An age slider lets the advisor watch
 * the 10% early-withdrawal penalty appear/disappear at the 59½ cliff
 * (the engine treats integer ages, so age < 60 triggers the penalty
 * for any IRA dollars used to pay tax).
 *
 * Conversion amount is fixed at $50K so the only variables in motion
 * are the two we want to teach: WHERE the tax comes from and WHEN.
 */

import { useEffect, useState } from 'react';
import { simulate } from '@/lib/training/simulate-action';
import type { TrainingSimResult } from '@/lib/training/simulate';

interface GrossUpPlaygroundProps {
  initialOutside: TrainingSimResult;
  initialInside: TrainingSimResult;
}

const CONVERSION_DOLLARS = 50_000;
const MIN_AGE = 55;
const MAX_AGE = 72;
const DEFAULT_AGE = 62;

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

export function GrossUpPlayground({ initialOutside, initialInside }: GrossUpPlaygroundProps) {
  const [age, setAge] = useState(DEFAULT_AGE);
  const [outside, setOutside] = useState(initialOutside);
  const [inside, setInside] = useState(initialInside);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (age === DEFAULT_AGE) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      const baseOverrides = {
        age,
        end_age: Math.max(age + 5, 90),
        conversion_type: 'fixed_amount' as const,
        fixed_conversion_amount: CONVERSION_DOLLARS * 100,
      };
      Promise.all([
        simulate('bob', { ...baseOverrides, tax_payment_source: 'from_taxable' }),
        simulate('bob', { ...baseOverrides, tax_payment_source: 'from_ira' }),
      ])
        .then(([o, i]) => {
          if (cancelled) return;
          setOutside(o);
          setInside(i);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [age]);

  const oY = outside.strategy[0];
  const iY = inside.strategy[0];

  const isUnder595 = age < 60; // engine treats integer ages — sub-60 = under 59½
  const penaltyActive = (iY.earlyWithdrawalPenalty ?? 0) > 0;

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Where does the tax bill come from?
      </h3>
      <p className="text-sm text-text-dim mb-6">
        Bob converts a flat $50K. The only thing that changes is whether he pays the tax from cash
        outside the IRA or pulls extra from the IRA itself — and how old he is when he does it.
      </p>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="age-slider-3" className="text-sm font-medium text-foreground">
            Bob&apos;s age this year
          </label>
          <span className="text-lg font-display font-semibold text-gold tabular-nums">
            {age} {isUnder595 && <span className="text-xs uppercase tracking-wider text-foreground/60 ml-1">under 59½</span>}
          </span>
        </div>
        <input
          id="age-slider-3"
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
          <span>59½ ↑</span>
          <span>{MAX_AGE}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
        {isLoading && (
          <div className="absolute -top-5 right-0 text-[10px] uppercase tracking-wider text-text-dimmer">
            calculating…
          </div>
        )}

        <div className="rounded-[10px] border border-border-default p-5">
          <div className="text-xs uppercase tracking-wider text-text-dimmer mb-3">
            Pay from outside the IRA
          </div>
          <div className="space-y-2.5">
            <Row label="Federal tax this year" value={fmt(oY.federalTax)} />
            <Row label="Early-withdrawal penalty" value={fmt(oY.earlyWithdrawalPenalty ?? 0)} muted={!oY.earlyWithdrawalPenalty} />
            <Row label="Roth IRA, year-end" value={fmt(oY.rothBalance)} highlight />
            <Row label="Traditional IRA, year-end" value={fmt(oY.traditionalBalance)} />
          </div>
        </div>

        <div className="rounded-[10px] border border-gold-border bg-accent/40 p-5">
          <div className="text-xs uppercase tracking-wider text-gold mb-3">Pay from inside the IRA</div>
          <div className="space-y-2.5">
            <Row label="Federal tax this year" value={fmt(iY.federalTax)} />
            <Row
              label="Early-withdrawal penalty"
              value={fmt(iY.earlyWithdrawalPenalty ?? 0)}
              highlight={penaltyActive}
              muted={!penaltyActive}
            />
            <Row label="Roth IRA, year-end" value={fmt(iY.rothBalance)} highlight />
            <Row label="Traditional IRA, year-end" value={fmt(iY.traditionalBalance)} />
          </div>
        </div>
      </div>

      <div className="mt-5 text-xs text-text-dimmer leading-relaxed space-y-2">
        <p>
          <strong className="text-foreground">Notice:</strong> when Bob pays from inside, the Roth
          ends up with <em>less than the full $50K</em>. That&apos;s the gross-up — extra IRA
          dollars had to leave to cover the tax bill, and those extra dollars themselves got taxed.
        </p>
        {isUnder595 && (
          <p className="text-foreground">
            At {age}, Bob is under 59½ — every IRA dollar pulled out to pay tax is hit with the 10%
            early-withdrawal penalty on top of the income tax. The conversion itself isn&apos;t
            penalized, but the withdrawal-to-pay-tax is.
          </p>
        )}
      </div>
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
        className={`text-base font-display font-semibold tabular-nums ${
          muted ? 'text-text-dimmer' : highlight ? 'text-gold' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
