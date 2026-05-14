/**
 * Module 2 body — "Marginal vs. Effective Tax: The Bracket-Fill Mental Model".
 */

import { simulateSync } from '@/lib/training/simulate';
import { BracketFillPlayground } from '../bracket-fill-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';

export function MarginalVsEffectiveTaxBody() {
  const initial = simulateSync('bob', {
    conversion_type: 'fixed_amount',
    fixed_conversion_amount: 50_000 * 100,
  });

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Brackets are layers, not labels
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          Most advisors describe tax brackets as labels — &ldquo;I&apos;m in the 22% bracket&rdquo;
          or &ldquo;the client&apos;s in the 24% bracket.&rdquo; That framing is incomplete, and
          for conversion strategy it costs real money.
        </p>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          Imagine taxable income as water filling a series of stacked buckets, from the bottom up.
          Each bucket has a tax rate stamped on the side. Water (income) fills the bottom bucket
          first; once that&apos;s full, it spills into the next one up.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          For a single filer in {new Date().getFullYear()}: the first ~$15K is the standard
          deduction (never taxed at all). The next ~$11K fills the 10% bracket. The next ~$35K
          fills the 12% bracket. The next ~$52K fills the 22% bracket. And so on up. Every dollar
          knows which bucket it landed in — no dollar gets taxed at a single &ldquo;your
          bracket&rdquo; rate.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Marginal vs. effective
        </h2>
        <ul className="space-y-2.5 text-base text-text-dim leading-relaxed">
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Marginal rate</strong> — the rate of the last
              bucket the water reached. The tax cost of one more dollar of income.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold shrink-0">·</span>
            <span>
              <strong className="text-foreground">Effective rate</strong> — total tax owed divided
              by total income. The average across the whole stack.
            </span>
          </li>
        </ul>
        <p className="text-base text-text-dim leading-relaxed mt-3">
          When Bob says &ldquo;I&apos;m in the 22% bracket,&rdquo; he means his marginal rate is
          22%. His effective rate is much lower — somewhere around 12–15% — because the first
          chunks of his income were taxed at 0%, 10%, and 12%.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Why this matters for conversions
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          When advisors say &ldquo;don&apos;t convert into a higher bracket,&rdquo; they usually
          mean &ldquo;the cost of the last converted dollar isn&apos;t worth it.&rdquo; That can
          be wrong. The widow penalty (Module 6) and RMD compression (Module 4) often mean
          today&apos;s 24% bracket is cheaper than tomorrow&apos;s 32%, even if filling it feels
          aggressive in the moment.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          Move the slider below and watch how each bracket fills, what tax that bracket adds, and
          where the marginal and effective rates settle.
        </p>
      </section>

      <BracketFillPlayground initial={initial} />

      <TryInRealClient cast="bob" />

      <ReflectionPrompt question="When a client asks 'what bracket am I in?', what's the most useful one-sentence answer?" />
    </div>
  );
}
