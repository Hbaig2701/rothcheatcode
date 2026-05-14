/**
 * Module 1 body — "What a Roth Conversion Actually Is".
 *
 * Server component. Runs the engine for the playground's initial state
 * server-side so the first paint shows real numbers; the playground
 * client component takes over from there as the slider moves.
 */

import { simulateSync } from '@/lib/training/simulate';
import { ConversionPlayground } from '../conversion-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';

const DEFAULT_CONVERSION_DOLLARS = 50_000;

export function WhatIsARothConversionBody() {
  const initial = simulateSync('bob', {
    conversion_type: 'fixed_amount',
    fixed_conversion_amount: DEFAULT_CONVERSION_DOLLARS * 100,
  });
  const baseline = simulateSync('bob', {
    conversion_type: 'no_conversion',
  });

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">The mechanics</h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          Bob has $500K sitting in his Traditional IRA. From the IRS&apos;s perspective, none of
          that money is really his yet — every dollar he eventually pulls out (or that gets pulled
          out for him via Required Minimum Distributions starting at age 73) gets taxed at his
          ordinary income rate that year.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          A <strong className="text-foreground">Roth conversion</strong> changes that. Bob
          transfers some amount — say $50K — from his Traditional IRA into a Roth IRA. The IRS
          treats that $50K as ordinary income for the year of the conversion: he owes federal tax
          on it now. But from that moment forward, those dollars (and every dollar of growth they
          generate) are his, tax-free, forever.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">What it isn&apos;t</h2>
        <ul className="space-y-2.5 text-base text-text-dim leading-relaxed">
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Not a withdrawal.</strong> The money stays inside
              the retirement system, just in a different bucket. Bob doesn&apos;t get a check.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Not an automatic 10% penalty event.</strong>{' '}
              Conversions themselves don&apos;t trigger the early-withdrawal penalty — but if the
              client is under 59½ AND uses IRA dollars to <em>pay</em> the conversion tax, that
              specific tax payment does incur the penalty. (Module 3 covers this in detail.)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Not a way to avoid tax.</strong> It&apos;s a way
              to choose <em>when</em> to pay tax (now vs. later) and <em>at what rate</em>{' '}
              (today&apos;s bracket vs. whatever the bracket is when RMDs start).
            </span>
          </li>
        </ul>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">The trade</h2>
        <p className="text-base text-text-dim leading-relaxed">
          You&apos;re paying tax dollars today in exchange for not paying (potentially more) tax
          dollars later. The whole rest of this curriculum is about figuring out whether that trade
          is worth it for a specific client — and how big the conversion should be each year to
          maximize the benefit without burning unnecessary brackets.
        </p>
        <p className="text-base text-text-dim leading-relaxed mt-3">
          For now, just play with Bob&apos;s numbers below and watch what happens to his accounts
          when he converts different amounts. The conversion you slide moves out of his Traditional
          IRA and shows up in his Roth — and the price tag is the federal tax bill for the year.
        </p>
      </section>

      <ConversionPlayground initial={initial} baseline={baseline} />

      <TryInRealClient cast="bob" />

      <ReflectionPrompt question="In one sentence, how would you explain a Roth conversion to a client who's hearing the term for the first time?" />
    </div>
  );
}
