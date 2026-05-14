/**
 * Module 7 body — "How Annuities Factor In — FIAs and Guaranteed Income".
 */

import { simulateSync } from '@/lib/training/simulate';
import { AnnuityBonusPlayground } from '../annuity-bonus-playground';
import { ReflectionPrompt } from '../reflection-prompt';
import { TryInRealClient } from '../try-in-real-client';

export function AnnuitiesAndConversionsBody() {
  const initial = simulateSync('joneses', {
    bonus_percent: 10,
    conversion_type: 'optimized_amount',
  });

  return (
    <div className="space-y-8">
      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Annuities don&apos;t change the conversion math
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          A Roth conversion is the same operation whether the IRA is held at a brokerage, a bank,
          or inside an annuity contract: dollars move from the Traditional bucket to the Roth
          bucket and ordinary income tax is owed on the converted amount. The IRS doesn&apos;t
          care what wrapper the money was in.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          What annuities <em>do</em> change is the <strong className="text-foreground">balance
          you&apos;re converting from</strong> and the <strong className="text-foreground">
          mechanics of how and when you can pull money</strong>. Three knobs to know.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Knob 1 — The bonus
        </h2>
        <p className="text-base text-text-dim leading-relaxed">
          When the client transfers $X into a Fixed Indexed Annuity, many carriers add a bonus
          (commonly 5–15%) on top. The IRA balance starts at $1.1X (or wherever) and earns
          interest from there. The downstream effect is mechanical: bigger balance = bigger
          conversion potential = bigger eventual RMDs if the client doesn&apos;t convert. The
          bonus isn&apos;t free in tax terms — it inflates the future tax liability alongside the
          future balance. That&apos;s exactly why bonus FIAs and aggressive conversion plans are
          a natural pairing.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Knob 2 — Surrender schedule
        </h2>
        <p className="text-base text-text-dim leading-relaxed mb-3">
          In the first 7–10 years of an FIA contract, pulling more than the penalty-free
          percentage (typically 10% per year of the prior anniversary balance) triggers a
          surrender charge. Surrender charges are stiff in early years (16% in year 1 isn&apos;t
          unusual) and grade down to zero by the end of the schedule.
        </p>
        <p className="text-base text-text-dim leading-relaxed">
          A Roth conversion is generally an intra-carrier movement and does <em>not</em> count
          against the penalty-free cap. But if the client pays the conversion tax from the IRA
          itself, that withdrawal-to-pay-tax is a real outflow and does count. For aggressive
          conversion strategies in year 1–3, this is the constraint advisors most often miss.
        </p>
      </section>

      <section className="prose-block">
        <h2 className="text-xl font-display font-semibold text-foreground mb-3">
          Knob 3 — GI roll-up
        </h2>
        <p className="text-base text-text-dim leading-relaxed">
          Guaranteed Income (income rider) products have a parallel value called the income base
          or roll-up balance, which grows at a stated rate (often 7–8%) until the client elects to
          turn on income. The income base is not a withdrawable cash balance — it&apos;s the
          number the guaranteed payout is calculated from. For conversion strategy, the GI
          contract&apos;s deferral years are often the conversion runway: convert hard during
          deferral, then turn on income (which is partially Roth-funded by then, so taxed
          differently).
        </p>
      </section>

      <AnnuityBonusPlayground initial={initial} />

      <TryInRealClient cast="joneses" />

      <ReflectionPrompt question="A client asks 'do I really need to convert if the FIA is already growing tax-deferred?' What's the one-sentence answer?" />
    </div>
  );
}
