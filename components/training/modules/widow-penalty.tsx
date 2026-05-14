/**
 * Module 6 body - "The Widow Penalty: Filing Status Compression".
 */

import { simulateSync } from '@/lib/training/simulate';
import { WidowPenaltyPlayground } from '../widow-penalty-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';
import { Term } from '../term';

export function WidowPenaltyBody() {
  // MFJ counterfactual - Mary stays married throughout the projection.
  const mfj = simulateSync('mary', {
    widow_analysis: false,
    widow_death_age: null,
    conversion_type: 'no_conversion',
  });
  // Widow scenario - Mary as a single filer from year 1, survivor SS only.
  const widow = simulateSync('mary', {
    filing_status: 'single',
    spouse_name: null,
    spouse_age: null,
    spouse_ssi_payout_age: null,
    spouse_ssi_annual_amount: null,
    widow_analysis: false,
    widow_death_age: null,
    conversion_type: 'no_conversion',
  });

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          What changes the day a spouse dies
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          When one spouse passes, the surviving spouse becomes a single filer the very next tax
          year. Three things happen at once, and each compounds the others:
        </p>
        <ul className="space-y-2.5 text-base text-text-dim leading-relaxed mb-3">
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Tax brackets compress.</strong> Single brackets
              are roughly half as wide as <Term name="mfj">MFJ</Term> brackets. The same dollar of
              income now sits in a much higher bracket.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground"><Term name="standard-deduction">Standard deduction</Term> halves.</strong>{' '}
              MFJ ~$30K + age bonus; single ~$15K + age bonus. Less shielded from tax before the
              brackets even start.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground"><Term name="social-security">Social Security</Term> drops.</strong>{' '}
              The survivor takes the higher of the two benefits, not the sum. So household SS
              often falls by 30-50% - but the IRA balance, <Term name="rmd">RMDs</Term>, and
              pension stay exactly where they were.
            </span>
          </li>
        </ul>
        <p className="text-base text-text-dim leading-relaxed">
          Net effect: less income, more tax. That&apos;s the widow penalty.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Why this drives conversion strategy for couples
        </h2>
        <p className="text-base text-text-dim leading-relaxed">
          A couple in their 60s and 70s should be modeling the survivor&apos;s tax bill, not just
          their joint one. Conversions done at MFJ rates today are a hedge against the survivor
          paying the same income at single rates a decade from now. The bigger the IRA at the
          first death, the more the surviving spouse will wish conversions had happened earlier.
        </p>
      </section>

      <WidowPenaltyPlayground initialMfj={mfj} initialWidow={widow} />

      <TryInRealClient cast="mary" />

      <ReflectionPrompt question="When you talk to a couple, how do you bring up the widow penalty without making it sound morbid?" />
    </div>
  );
}
