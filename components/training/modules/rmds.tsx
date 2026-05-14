/**
 * Module 4 body - "RMDs: Why the Government Eventually Forces Distributions".
 */

import { simulateSync } from '@/lib/training/simulate';
import { RmdPlayground } from '../rmd-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';
import { Term } from '../term';

export function RmdsBody() {
  const initial = simulateSync('mary', {
    widow_analysis: false,
    widow_death_age: null,
    conversion_type: 'no_conversion',
  });

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          The 73-year-old cliff
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          <Term name="traditional-ira">Traditional IRAs</Term> are not really &ldquo;the
          client&apos;s money&rdquo; in any final sense - they&apos;re a tax-deferral arrangement.
          The IRS lets the money grow without taxation for decades on the implicit understanding
          that, eventually, those dollars come out and get taxed at ordinary rates.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          That &ldquo;eventually&rdquo; is age 73. Under <Term name="secure-2">SECURE 2.0</Term>,
          the year your client turns 73 (74 from 2033 onward) is the year{' '}
          <Term name="rmd">Required Minimum Distributions</Term> begin. The IRS sets the amount
          each year using a Uniform Lifetime Table - roughly: prior year-end IRA balance divided
          by the distribution period for the client&apos;s current age.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Why RMDs grow even when the balance shrinks
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          The distribution period in the table shrinks every year - at 73 it&apos;s 26.5; at 80
          it&apos;s 20.2; at 90 it&apos;s 12.2. So even if Mary&apos;s IRA balance stays flat or
          drops, the percentage of it she&apos;s required to pull out goes up. By age 90, she has
          to take roughly 8% of the balance every year. By 95, more like 11%.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          That growth stacks on top of her <Term name="social-security">Social Security</Term> and
          any other ordinary income. The larger the IRA at age 70, the more violently this
          collision happens.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          What this means for conversion strategy
        </h2>
        <p className="text-base text-text-dim leading-relaxed">
          <Term name="roth-conversion">Roth conversions</Term> exist almost entirely{' '}
          <em>because of</em> RMDs. The reason advisors push conversions in the years between
          retirement (often early 60s) and age 73 is to drain the Traditional IRA at the
          client&apos;s chosen brackets, before the IRS starts forcing distributions at whatever
          bracket the calendar lands them in.
        </p>
      </section>

      <RmdPlayground initial={initial} />

      <TryInRealClient cast="mary" />

      <ReflectionPrompt question="If a 65-year-old client tells you 'I don't need the IRA money for income - I'll just leave it,' what's the one-sentence response?" />
    </div>
  );
}
