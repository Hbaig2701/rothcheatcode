/**
 * Module 5 body - "IRMAA: The Medicare Cliff Most Advisors Miss".
 */

import { simulateSync } from '@/lib/training/simulate';
import { IrmaaPlayground } from '../irmaa-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';
import { Term } from '../term';

export function IrmaaBody() {
  // Mirrors the playground's overrides — see the playground for the full
  // rationale. Short version: SS-at-65 + $80K conversion lands MAGI just
  // past the Tier 1 cliff so the visualization is meaningful at default.
  const initial = simulateSync('joneses', {
    conversion_type: 'fixed_amount',
    fixed_conversion_amount: 80_000 * 100,
    ssi_payout_age: 65,
    spouse_ssi_payout_age: 65,
  });

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          What IRMAA actually is
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          IRMAA - Income-Related Monthly Adjustment Amount - is a surcharge on Medicare Part B and
          Part D premiums. Anyone on Medicare with <Term name="magi">MAGI</Term> above a threshold
          pays it; below the threshold, they pay the standard premium (~$185/month for Part B in
          2026).
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          The catch: IRMAA looks at MAGI from <em>two years prior</em>. So a big conversion in
          2026 shows up as a 2028 IRMAA bill. Clients are often surprised by the delayed cost.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          The cliff that&apos;s not a slope
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          Federal income tax brackets are a slope - you pay 22% on each dollar in the 22% bracket,
          24% on each dollar in the 24% bracket, etc. IRMAA is the opposite: a step function. One
          dollar over a tier threshold dumps the client into the next tier, and the entire
          surcharge for that tier kicks in immediately.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          For an <Term name="mfj">MFJ</Term> couple in 2026: crossing from Standard into Tier 1 by
          $1 of MAGI costs ~$1,680 per year (combined). Crossing from Tier 1 into Tier 2: another
          $4,200/year. By Tier 4, the couple is paying over $9,000/year in extra Medicare premiums
          alone - for the rest of their lives at that income level.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          The strategic implication
        </h2>
        <p className="text-base text-text-dim leading-relaxed">
          Big conversions need to land cleanly inside a tier (using all the headroom up to the
          next threshold) or push fully past one if a partial cross is unavoidable. The worst
          outcome is a conversion that triggers the next tier by a few thousand dollars - you got
          some of the conversion benefit but paid the full IRMAA penalty.
        </p>
      </section>

      <IrmaaPlayground initial={initial} />

      <TryInRealClient cast="joneses" />

      <ReflectionPrompt question="When you're sizing a conversion for an IRMAA-sensitive client, what's the first number you check?" />
    </div>
  );
}
