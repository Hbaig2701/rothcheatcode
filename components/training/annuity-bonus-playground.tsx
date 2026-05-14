'use client';

/**
 * Module 7 playground — annuity bonus as multiplier.
 *
 * Slider on the carrier bonus % drives the Joneses' starting IRA
 * balance. Below it, four numbers show how that one knob ripples
 * through the entire conversion math: starting balance, balance at
 * age 73, first-year RMD, and the lifetime tax savings vs. no
 * conversion.
 *
 * The lesson is that annuity bonuses aren't a gimmick — they
 * multiply every downstream number, including (importantly) the RMDs
 * the client will eventually be forced to take. Bigger pre-bonus
 * balance + bigger bonus = bigger Roth strategy *and* bigger
 * unmitigated RMD pressure if the client doesn't convert.
 */

import { useEffect, useMemo, useState } from 'react';
import { simulate } from '@/lib/training/simulate-action';
import type { TrainingSimResult } from '@/lib/training/simulate';

interface AnnuityBonusPlaygroundProps {
  initial: TrainingSimResult;
}

const MIN_BONUS = 0;
const MAX_BONUS = 20;
const STEP = 1;
const DEFAULT_BONUS = 10;

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

export function AnnuityBonusPlayground({ initial }: AnnuityBonusPlaygroundProps) {
  const [bonus, setBonus] = useState(DEFAULT_BONUS);
  const [sim, setSim] = useState(initial);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (bonus === DEFAULT_BONUS) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      simulate('joneses', {
        bonus_percent: bonus,
        conversion_type: 'optimized_amount',
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
  }, [bonus]);

  const stats = useMemo(() => {
    const startingBalance = (1_200_000_00) * (1 + bonus / 100); // $1.2M base + bonus
    const at73 = sim.baseline.find((y) => y.age === 73);
    const rmdAt73 = at73?.rmdAmount ?? 0;
    const balanceAt73 = at73?.traditionalBalance ?? 0;
    return {
      startingBalance,
      balanceAt73,
      rmdAt73,
      taxSavings: sim.summary.wealth.formulaLifetimeWealth - sim.summary.wealth.baselineLifetimeWealth,
    };
  }, [bonus, sim]);

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        The bonus is a multiplier on everything
      </h3>
      <p className="text-sm text-text-dim mb-6">
        The Joneses move $1.2M into a carrier-issued FIA. The bonus % below is what the carrier
        adds on top. Watch how a single number cascades through their starting balance, their
        eventual RMDs, and the lifetime wealth gain from a Roth strategy vs. doing nothing.
      </p>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="bonus-slider-7" className="text-sm font-medium text-foreground">
            Carrier bonus on the IRA premium
          </label>
          <span className="text-lg font-display font-semibold text-gold tabular-nums">{bonus}%</span>
        </div>
        <input
          id="bonus-slider-7"
          type="range"
          min={MIN_BONUS}
          max={MAX_BONUS}
          step={STEP}
          value={bonus}
          onChange={(e) => setBonus(Number(e.target.value))}
          className="w-full accent-gold cursor-pointer"
        />
        <div className="flex justify-between text-xs text-text-dimmer mt-1.5">
          <span>0%</span>
          <span>10%</span>
          <span>20%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative">
        {isLoading && (
          <div className="absolute -top-5 right-0 text-[10px] uppercase tracking-wider text-text-dimmer">
            calculating…
          </div>
        )}
        <Stat label="Starting IRA after bonus" value={fmtCompact(stats.startingBalance)} />
        <Stat label="Balance at age 73 (no conversion)" value={fmtCompact(stats.balanceAt73)} />
        <Stat label="First-year RMD at 73" value={fmt(stats.rmdAt73)} highlight={stats.rmdAt73 > 0} />
        <Stat
          label="Lifetime gain vs. no conversion"
          value={fmtCompact(stats.taxSavings)}
          highlight={stats.taxSavings > 0}
        />
      </div>

      <p className="text-xs text-text-dimmer mt-5 leading-relaxed">
        Notice how the first-year RMD scales with the bonus too. The bonus isn&apos;t free — it
        grows the future tax liability alongside the future balance. That&apos;s exactly why
        carrier-bonus FIAs are usually paired with an aggressive conversion plan: convert at
        chosen brackets now, before the IRS forces distributions on the inflated balance.
      </p>

      <div className="mt-6 pt-5 border-t border-border-default">
        <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-2">
          Two more annuity knobs (not in the playground)
        </div>
        <ul className="space-y-2 text-sm text-text-dim leading-relaxed">
          <li>
            <strong className="text-foreground">Surrender schedule.</strong> In early years
            (typically 7–10), pulling more than the penalty-free percentage (usually 10%/yr) costs
            a surrender charge. Conversions inside the carrier don&apos;t typically trigger this,
            but if the client pays the conversion tax from the IRA itself, that withdrawal does
            count against the cap.
          </li>
          <li>
            <strong className="text-foreground">GI roll-up rate.</strong> On Guaranteed Income
            products, the income base grows at a fixed rate (often 7–8%) until the client elects
            income. The roll-up balance is separate from the cash value — it&apos;s the basis the
            guaranteed payout is calculated from.
          </li>
        </ul>
      </div>
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
    <div
      className={`rounded-[10px] border p-4 ${highlight ? 'border-gold-border bg-accent/40' : 'border-border-default'}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-text-dimmer mb-1">{label}</div>
      <div
        className={`text-lg font-display font-semibold tabular-nums ${highlight ? 'text-gold' : 'text-foreground'}`}
      >
        {value}
      </div>
    </div>
  );
}
