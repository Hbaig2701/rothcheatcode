import type { PrepFacts, PrepWarning } from './types';

const usd = (cents: number) => '$' + Math.round(cents / 100).toLocaleString('en-US');
const yrs = (n: number) => `${n} year${n === 1 ? '' : 's'}`;

/**
 * "Watch out for this" rules.
 *
 * Each rule is a pure function of the facts with ONE explicit threshold, so it
 * can be unit-tested for both firing and staying silent. A warning that fires
 * when it shouldn't is worse than no warning at all — the advisor stops
 * trusting the page.
 *
 * Rules state a fact and its consequence. They never predict (how long someone
 * lives, what markets do) and never tell the advisor what to recommend.
 *
 * COPY RULE: address the client by first name and use they/their. We do not
 * know anyone's gender from a name, and a brief that says "his wife" to a
 * female client is both wrong and embarrassing in front of that client.
 */

/** Medicare surcharges materially worse under the strategy. */
const IRMAA_WORSE_MIN = 500_000;          // $5,000 lifetime
/** Legacy crossover lands this close to the end of the plan. */
const CROSSOVER_TIGHT_YEARS = 8;
/** A single year's conversion tax this large deserves a heads-up. */
const BIG_YEAR_TAX = 5_000_000;           // $50,000
/** A headline gain above this will strain belief and should be sanity-checked. */
const IMPLAUSIBLE_GAIN_PCT = 200;
/** Widow's extra tax worth raising. */
const WIDOW_MIN = 1_000_000;              // $10,000
/** Lifetime tax saving big enough to lead with when legacy is negative. */
const TAX_SAVING_MIN = 1_000_000;         // $10,000

export function buildWarnings(f: PrepFacts): PrepWarning[] {
  const w: PrepWarning[] = [];
  const N = f.firstName;

  // 1. The plan loses money for the family.
  if (f.legacyGain < 0) {
    w.push({
      id: 'legacy-negative',
      tone: 'watch',
      headline: `This plan leaves the family ${usd(Math.abs(f.legacyGain))} LESS`,
      detail:
        f.lifetimeTaxSaved >= TAX_SAVING_MIN
          ? `It does save ${usd(f.lifetimeTaxSaved)} in tax during ${N}'s lifetime, but the family ends up behind. Do not lead with the legacy number — lead with the tax saving and with never having forced withdrawals again. Make sure you can explain the trade before you present it.`
          : `And it does not make up for it in tax savings either. Check the inputs before this meeting — a plan that loses on both counts usually means the growth rate, the bracket ceiling, or the conversion amount needs changing.`,
      say: `This is not about leaving more money behind. It is about you paying less tax while you are alive and not being forced to take money out every year.`,
    });
  }

  // 2. Medicare gets worse, not better.
  const irmaaDelta = f.strategyIrmaaTotal - f.baselineIrmaaTotal;
  if (irmaaDelta >= IRMAA_WORSE_MIN) {
    w.push({
      id: 'irmaa-worse',
      tone: 'watch',
      headline: 'Medicare premiums go UP with this plan',
      detail: `${usd(f.baselineIrmaaTotal)} doing nothing, ${usd(f.strategyIrmaaTotal)} with this plan — ${usd(irmaaDelta)} worse over ${N}'s lifetime. Their accountant will find this. Say it first.`,
      say: `Your Medicare premiums will be higher for a few years while we move the money. In exchange, that money is never taxed again — for you or for your family. We are trading a few years of higher premiums for a permanent fix.`,
    });
  }

  // 3. The family never gets ahead.
  if (!f.aheadAtEnd && f.legacyFallsBehindAge != null && f.legacyFallsBehindAge > f.age) {
    w.push({
      id: 'falls-behind',
      tone: 'watch',
      headline: `The family is ahead until ${f.legacyFallsBehindAge}, then falls behind`,
      detail: `Early death favours this plan; a long life does not. That is the opposite of how these are usually sold, so be careful not to pitch it as a long-life benefit.`,
    });
  } else if (f.aheadAtEnd && (f.legacyCrossoverAge != null &&
    f.legacyCrossoverAge != null &&
    f.endAge - f.legacyCrossoverAge <= CROSSOVER_TIGHT_YEARS &&
    f.legacyCrossoverAge > f.age
  )) {
    w.push({
      id: 'crossover-tight',
      tone: 'watch',
      headline: `The family is not ahead until age ${f.legacyCrossoverAge}`,
      detail: `The plan runs to ${f.endAge}, so that is only ${yrs(f.endAge - f.legacyCrossoverAge)} of benefit. If ${N} has any health concerns, be honest about it and show a smaller version instead.`,
      say: `This takes until about age ${f.legacyCrossoverAge} before your family is ahead. If you are comfortable with that, it works. If not, we can do a smaller amount.`,
    });
  }

  // 4. One painful year.
  if (f.worstYearTax >= BIG_YEAR_TAX && f.worstYearAge != null) {
    w.push({
      id: 'big-year',
      tone: 'watch',
      headline: `One year has a ${usd(f.worstYearTax)} tax bill (age ${f.worstYearAge})`,
      detail: `That is the number ${N} will react to, not the total. Have the year-by-year table open so they can see it is one year, not every year.`,
    });
  }

  // 5. Headline that will not be believed.
  if (f.legacyGainPct >= IMPLAUSIBLE_GAIN_PCT) {
    w.push({
      id: 'implausible',
      tone: 'check',
      headline: 'Check your growth rate before you present this',
      detail: `The plan shows a ${Math.round(f.legacyGainPct)}% improvement. Some clients will not believe a number that big. If the growth rate looks high, run it again lower — a smaller number they believe beats a bigger one they do not.`,
    });
  }

  // 6. No runway left.
  if (f.alreadyPastRmdAge) {
    w.push({
      id: 'past-rmd',
      tone: 'watch',
      headline: 'Forced withdrawals have already started',
      detail: `${N} is ${f.age} and withdrawals began at ${f.firstRmdAge}. Each year the forced withdrawal fills more of the low tax bracket, leaving less room to convert. This is a smaller opportunity than it would have been five years ago — say so plainly rather than overselling it.`,
      say: `We cannot undo the withdrawals you are already taking. What we can still do is stop the rest of the account from growing into a bigger tax bill every year.`,
    });
  }

  // 7. Tax paid from the IRA shrinks the account.
  if (f.taxFromIra && f.conversionTaxTotal > 0) {
    w.push({
      id: 'tax-from-ira',
      tone: 'watch',
      headline: 'The tax is coming out of the retirement account itself',
      detail: `${usd(f.conversionTaxTotal)} of tax is paid from the account, so that money never reaches the Roth. If ${N} has cash or a brokerage account to pay from instead, the result improves. Worth asking before the meeting.`,
      say: `Do you have savings outside the retirement account we could use to pay the tax? If so, more of your money stays invested.`,
    });
  }

  // 8. Widow penalty.
  if (f.widowExtraTax != null && f.widowExtraTax >= WIDOW_MIN) {
    w.push({
      id: 'widow',
      tone: 'watch',
      headline: `If one of them dies first, the survivor pays ${usd(f.widowExtraTax)} more in tax`,
      detail: `The survivor files as single — half the standard deduction, narrower brackets, on nearly the same income. This is usually the most persuasive part of the conversation for a married couple, and the hardest to raise. Raise it gently.`,
      say: `There is one more thing worth planning for. If something happens to one of you, the survivor files taxes as a single person. Same income, higher tax. Converting now protects whoever is left.`,
    });
  }

  // 9. The account does not get emptied.
  if (f.strategyFinalTraditional > 0 && f.iraFullyConvertedByAge == null) {
    w.push({
      id: 'not-finished',
      tone: 'check',
      headline: 'This plan does not finish the job',
      detail: `${usd(f.strategyFinalTraditional)} is still in the taxable account at age ${f.endAge}, and the heirs pay ${Math.round(f.heirRatePct)}% on it. To clear it fully, the conversion has to be bigger or start sooner.`,
    });
  }

  return w;
}
