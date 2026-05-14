/**
 * Module 8 body (capstone) - "Reading a Retirement Expert Report End-to-End".
 *
 * Synthesis module. The narrative ties the prior seven modules together
 * into a single mental model for what an advisor sees in the actual app.
 * The playground lets them scrub through years of the Joneses' real
 * projection with each column annotated.
 */

import Link from 'next/link';
import { simulateSync } from '@/lib/training/simulate';
import { ReportWalkthroughPlayground } from '../report-walkthrough-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';
import { Term } from '../term';

const fmtCompact = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.round(cents / 100));

const pct = (n: number) => `${n.toFixed(1)}%`;

export function ReadingAReportBody() {
  const sim = simulateSync('joneses', {
    conversion_type: 'optimized_amount',
  });

  const lifetimeGain = sim.summary.wealth.formulaLifetimeWealth - sim.summary.wealth.baselineLifetimeWealth;
  const totalConversions = sim.summary.distributions.formula;
  const totalTaxOnConversions = sim.summary.distributions.formulaTax;

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          What a Retirement Expert report is, in one sentence
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          A side-by-side comparison of two futures for the same client: the &ldquo;do
          nothing&rdquo; future where they accept whatever <Term name="rmd">RMDs</Term> the IRS
          hands them, and the &ldquo;Roth strategy&rdquo; future where they convert proactively at
          chosen brackets. Every chart, table, and summary number on the report exists to quantify
          the gap between those two futures and convince the client which one is worth pursuing.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          The summary card up top
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          Most reports lead with three or four headline numbers. For the Joneses (the cast member
          for this module - <Term name="mfj">MFJ</Term>, 65, $1.2M IRA), the engine produced:
        </p>
        <ul className="space-y-2.5 text-base text-text-dim leading-relaxed">
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Lifetime wealth gain</strong> -{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {fmtCompact(lifetimeGain)}
              </span>{' '}
              more in the family&apos;s hands across the projection. Sum of after-tax
              distributions + final account balances after all costs (Module 4 + 5 + 6 all feed
              into this).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Total conversions</strong> -{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {fmtCompact(totalConversions)}
              </span>{' '}
              moved from Traditional to Roth across all strategy years. Total tax paid on those
              conversions: <span className="font-semibold">{fmtCompact(totalTaxOnConversions)}</span>{' '}
              (effective ~{pct((totalTaxOnConversions / Math.max(1, totalConversions)) * 100)}{' '}
              of converted dollars - the cost of admission).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground"><Term name="heir-benefit">Heir benefit</Term></strong>{' '}
              - Roth dollars passed to heirs are tax-free; Traditional dollars are taxed at the
              heir&apos;s rate. The difference shows up here, and for high-balance clients
              it&apos;s often the dominant line in the lifetime-wealth calculation.
            </span>
          </li>
        </ul>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          The wealth chart
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          Two lines: the baseline and the strategy. Both start at the same place. The baseline
          climbs steadily through the conversion years (no tax paid yet), then bends downward as
          RMDs kick in at 73 and big slugs of tax start leaving the household. The strategy line
          dips below baseline early (conversion taxes are real and immediate), crosses back above
          it at the <strong className="text-foreground"><Term name="tax-payback-age">tax-payback age</Term></strong>,
          and pulls steadily ahead from there.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          When a client says &ldquo;why am I paying tax I don&apos;t need to?&rdquo;, point at
          where the lines cross. That crossover is the moment their conversion strategy has paid
          for itself in cumulative tax savings - everything after it is upside.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          The year-by-year table
        </h2>
        <p className="text-base text-text-dim leading-relaxed">
          The deep-dive table is where every concept from the prior seven modules lives in
          column form. Each row is one year; each column is a number the engine computed; each
          cell tells a small piece of the story. The playground below puts the most important
          columns on cards with one-line explanations and links back to the module that taught
          the concept. Scrub the slider until you can explain every card without looking.
        </p>
      </section>

      <ReportWalkthroughPlayground sim={sim} />

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          You&apos;re done - what now
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          Open one of your real clients and read their report cold, then use this module&apos;s
          slider format as a mental check: can you explain every column in the year-by-year table
          without re-reading anything? If yes, you&apos;ve got the model. If not, the linked
          module on the card is the right place to go back to.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          The other modules stay open - refer back any time. And anything you wish was in the
          curriculum but isn&apos;t,{' '}
          <Link href="/support-centre" className="text-gold hover:underline">
            tell us through support
          </Link>
          .
        </p>
      </section>

      <TryInRealClient cast="joneses" />

      <ReflectionPrompt question="In one sentence, what does the Roth strategy actually do for a client like the Joneses - and how would you say it?" />
    </div>
  );
}
