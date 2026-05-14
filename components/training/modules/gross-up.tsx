/**
 * Module 3 body - "Gross-Up: Paying the Tax From Inside vs. Outside the IRA".
 */

import { simulateSync } from '@/lib/training/simulate';
import { GrossUpPlayground } from '../gross-up-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';
import { Term } from '../term';

export function GrossUpBody() {
  const baseOverrides = {
    conversion_type: 'fixed_amount' as const,
    fixed_conversion_amount: 50_000 * 100,
  };
  const initialOutside = simulateSync('bob', { ...baseOverrides, tax_payment_source: 'from_taxable' });
  const initialInside = simulateSync('bob', { ...baseOverrides, tax_payment_source: 'from_ira' });

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">Two paths</h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          When Bob converts $50K, he owes federal tax on $50K of ordinary income. The conversion
          itself moves $50K from <Term name="traditional-ira">Traditional</Term> to{' '}
          <Term name="roth-ira">Roth</Term>. The question is: where does the{' '}
          <Term name="tax-payment-source">tax payment</Term> come from?
        </p>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          <strong className="text-foreground">From outside the IRA.</strong> Cash from a brokerage
          account, savings, anywhere outside the qualified bucket. The full $50K lands in the
          Roth; Bob writes a check for the tax from his existing cash. Clean.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          <strong className="text-foreground">From inside the IRA.</strong> To cover the ~$11K tax
          bill, Bob has to withdraw <em>more</em> than $11K from the IRA - because that withdrawal
          itself is taxable income. Adding it to his stack pushes his tax bill higher, which means
          he has to pull out even more, and so on until the math closes. This is the &ldquo;gross
          up.&rdquo; End result: more than $11K leaves the IRA, and the Roth ends up with less
          than the full $50K.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          The under-59½ wrinkle
        </h2>
        <p className="text-base text-text-dim leading-relaxed">
          The conversion itself does not trigger the{' '}
          <Term name="early-withdrawal-penalty">10% early-withdrawal penalty</Term>. But if the
          client is under 59½ <em>and</em> uses IRA dollars to pay the conversion tax, that
          withdrawal-to-pay-tax does get hit with the penalty. So a 56-year-old converting and
          paying from inside the IRA effectively pays: ordinary income tax + gross-up tax + 10%
          penalty on the IRA dollars used for tax. Move the age slider below to see this kick in.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          What it means in practice
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          For a client with cash sitting <em>outside</em> the IRA, paying conversion taxes
          externally is almost always the right call. Every dollar that stays in the Roth grows
          tax-free for the rest of their life and their heirs&apos; lives.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          For a client whose assets are almost entirely inside qualified accounts - common for
          late-career converters who maxed retirement contributions - the &ldquo;from inside&rdquo;
          path may be the only option. Modeling the gross-up correctly is the difference between
          an honest projection and a fantasy.
        </p>
      </section>

      <GrossUpPlayground initialOutside={initialOutside} initialInside={initialInside} />

      <TryInRealClient cast="bob" />

      <ReflectionPrompt question="Under what circumstances would you tell a client that paying conversion tax from inside the IRA is acceptable?" />
    </div>
  );
}
