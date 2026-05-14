'use client';

/**
 * Module 8 (capstone) playground — annotated report walkthrough.
 *
 * Slider scrubs through years of the Joneses' actual projection. The
 * displayed row breaks each meaningful column into a labeled card with
 * a one-line explanation linked back to the module that taught it.
 * This is what the curriculum has been building toward: the advisor
 * looks at a real row of the year-by-year table and can explain every
 * field without hesitation.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { TrainingSimResult } from '@/lib/training/simulate';
import type { YearlyResult } from '@/lib/calculations/types';

interface ReportWalkthroughPlaygroundProps {
  sim: TrainingSimResult;
}

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

interface FieldCard {
  label: string;
  value: string;
  note: string;
  moduleLink?: { slug: string; title: string };
}

function buildFieldCards(year: YearlyResult): FieldCard[] {
  return [
    {
      label: 'Traditional IRA, year-end',
      value: fmtCompact(year.traditionalBalance),
      note: 'What\'s left in the pre-tax bucket after this year\'s growth, RMD, and conversion.',
    },
    {
      label: 'Roth IRA, year-end',
      value: fmtCompact(year.rothBalance),
      note: 'Cumulative converted dollars + their tax-free growth. This is the bucket the strategy is building.',
      moduleLink: { slug: 'what-is-a-roth-conversion', title: 'Module 1' },
    },
    {
      label: 'Conversion this year',
      value: fmt(year.conversionAmount),
      note: 'Dollars moved from Traditional → Roth this year. Adds to taxable income at ordinary rates.',
      moduleLink: { slug: 'what-is-a-roth-conversion', title: 'Module 1' },
    },
    {
      label: 'RMD this year',
      value: fmt(year.rmdAmount),
      note: year.rmdAmount > 0
        ? 'IRS-required pull from the Traditional IRA. Starts at age 73 and grows as the distribution period shrinks.'
        : 'Not yet — RMDs start at age 73.',
      moduleLink: { slug: 'rmds', title: 'Module 4' },
    },
    {
      label: 'Total income (taxable)',
      value: fmt(year.totalIncome),
      note: 'Conversion + RMD + Social Security + pension + other. This is what fills the brackets.',
      moduleLink: { slug: 'marginal-vs-effective-tax', title: 'Module 2' },
    },
    {
      label: 'Marginal bracket',
      value: `${year.federalTaxBracket ?? 0}%`,
      note: 'The top bracket the last dollar of income reached. Not the rate the whole stack pays.',
      moduleLink: { slug: 'marginal-vs-effective-tax', title: 'Module 2' },
    },
    {
      label: 'Federal tax',
      value: fmt(year.federalTax),
      note: 'Sum of tax owed across every bracket the income filled.',
    },
    {
      label: 'IRMAA surcharge',
      value: fmt(year.irmaaSurcharge),
      note: year.irmaaSurcharge > 0
        ? 'Medicare premium surcharge tier triggered by MAGI from 2 years prior.'
        : 'No IRMAA tier crossed this year — MAGI stayed below the threshold.',
      moduleLink: { slug: 'irmaa', title: 'Module 5' },
    },
    {
      label: 'Total tax (all sources)',
      value: fmt(year.totalTax),
      note: 'Federal + state + NIIT + IRMAA. This is the all-in cost the chart minimizes.',
    },
    {
      label: 'Net worth',
      value: fmtCompact(year.netWorth),
      note: 'Sum of all account balances at year end. The wealth chart plots this minus the upfront tax cost.',
    },
  ];
}

export function ReportWalkthroughPlayground({ sim }: ReportWalkthroughPlaygroundProps) {
  const years = sim.strategy;
  const minAge = years[0].age;
  const maxAge = years[years.length - 1].age;
  const [age, setAge] = useState(73); // start where the action happens (RMDs)

  const safeAge = Math.min(Math.max(age, minAge), maxAge);
  const year = useMemo(() => years.find((y) => y.age === safeAge) ?? years[0], [years, safeAge]);
  const cards = useMemo(() => buildFieldCards(year), [year]);

  return (
    <div className="rounded-[14px] bg-bg-card border border-border-default p-6">
      <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-1">Playground</div>
      <h3 className="text-base font-semibold text-foreground mb-1">
        Scrub through the Joneses&apos; report
      </h3>
      <p className="text-sm text-text-dim mb-6">
        Each card below is one column from the year-by-year table. Move the slider to inspect
        different years — pre-RMD, post-RMD, late retirement — and re-read the columns until you
        could explain every one to a client cold.
      </p>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="age-slider-8" className="text-sm font-medium text-foreground">
            Inspect year — couple&apos;s age
          </label>
          <span className="text-lg font-display font-semibold text-gold tabular-nums">{safeAge}</span>
        </div>
        <input
          id="age-slider-8"
          type="range"
          min={minAge}
          max={maxAge}
          step={1}
          value={safeAge}
          onChange={(e) => setAge(Number(e.target.value))}
          className="w-full accent-gold cursor-pointer"
        />
        <div className="flex justify-between text-xs text-text-dimmer mt-1.5">
          <span>{minAge}</span>
          <span>73 (RMDs start)</span>
          <span>{maxAge}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[10px] border border-border-default p-4">
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <div className="text-xs uppercase tracking-wider text-text-dimmer">{c.label}</div>
              <div className="text-base font-display font-semibold tabular-nums text-foreground">
                {c.value}
              </div>
            </div>
            <p className="text-xs text-text-dim leading-relaxed">{c.note}</p>
            {c.moduleLink && (
              <Link
                href={`/training/theory/${c.moduleLink.slug}`}
                className="inline-block mt-2 text-[11px] text-gold hover:underline"
              >
                ↳ Refresh on {c.moduleLink.title}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
