/**
 * Roth Conversion Theory — module registry.
 *
 * Each module has:
 *   - slug:          URL segment under /training/theory/[slug]
 *   - title:         human-friendly title (curriculum index + module header)
 *   - tagline:       one-line "what you'll learn"
 *   - cast:          which fixture client(s) the module narrates around
 *   - learningGoal:  the single sentence the advisor should be able to say
 *                    out loud after finishing — drives the soft reflection
 *                    prompt at module end
 *   - estimatedMinutes: rough read+play time, surfaced on the index card
 *   - status:        'ready' once content is authored; 'stub' otherwise
 *
 * Module bodies live alongside the registry inside the per-module directory
 * (built in Phase 2/3) so this file stays a lightweight catalog.
 */

import type { CastId } from './cast';

export interface TheoryModule {
  slug: string;
  order: number;
  title: string;
  tagline: string;
  cast: CastId;
  learningGoal: string;
  estimatedMinutes: number;
  status: 'ready' | 'stub';
}

export const THEORY_MODULES: TheoryModule[] = [
  {
    slug: 'what-is-a-roth-conversion',
    order: 1,
    title: 'What a Roth Conversion Actually Is',
    tagline: 'The mechanics, not the marketing — what moves, what gets taxed, and why.',
    cast: 'bob',
    learningGoal:
      'A Roth conversion moves dollars from a Traditional IRA to a Roth IRA, you pay ordinary income tax on the converted amount this year, and from then on those dollars (and their growth) are tax-free.',
    estimatedMinutes: 5,
    status: 'ready',
  },
  {
    slug: 'marginal-vs-effective-tax',
    order: 2,
    title: 'Marginal vs. Effective Tax — The Bracket-Fill Mental Model',
    tagline: 'Why "what bracket am I in?" is the wrong question, and what to ask instead.',
    cast: 'bob',
    learningGoal:
      'Conversions stack on top of existing income and fill brackets one at a time — the marginal rate is what each additional dollar costs, the effective rate is what the whole stack averages out to.',
    estimatedMinutes: 6,
    status: 'ready',
  },
  {
    slug: 'gross-up',
    order: 3,
    title: 'Gross-Up — Paying the Tax From Inside vs. Outside the IRA',
    tagline: 'When the conversion has to fund its own tax bill, every dollar counts twice.',
    cast: 'bob',
    learningGoal:
      'Paying conversion tax from outside the IRA preserves the full converted amount in the Roth; paying from inside means part of the conversion goes to taxes (plus a 10% penalty if under 59½), shrinking the Roth balance.',
    estimatedMinutes: 6,
    status: 'stub',
  },
  {
    slug: 'rmds',
    order: 4,
    title: 'RMDs — Why the Government Eventually Forces Distributions',
    tagline: 'The 73-year-old cliff that drives most conversion strategies.',
    cast: 'mary',
    learningGoal:
      'Required Minimum Distributions force Traditional IRA money out at age 73+, and once they start, they stack on top of Social Security and pensions, which can push retirees into much higher brackets than they expected.',
    estimatedMinutes: 6,
    status: 'stub',
  },
  {
    slug: 'irmaa',
    order: 5,
    title: 'IRMAA — The Medicare Cliff Most Advisors Miss',
    tagline: 'A $1 income increase can cost $5K in Medicare premiums. Literally.',
    cast: 'joneses',
    learningGoal:
      'IRMAA surcharges are tier-based on MAGI from two years prior — crossing a tier by a single dollar triggers the full surcharge, so big conversions need to land cleanly inside a tier or fully past it.',
    estimatedMinutes: 7,
    status: 'stub',
  },
  {
    slug: 'widow-penalty',
    order: 6,
    title: 'The Widow Penalty — Filing Status Compression',
    tagline: 'Why a couple\'s tax plan needs to anticipate becoming a single filer.',
    cast: 'mary',
    learningGoal:
      'When one spouse dies, the survivor moves from MFJ to single brackets (which are roughly half the width) but the RMDs and Social Security stay the same — so the same income suddenly hits much higher brackets, often costing tens of thousands per year.',
    estimatedMinutes: 7,
    status: 'stub',
  },
  {
    slug: 'annuities-and-conversions',
    order: 7,
    title: 'How Annuities Factor In — FIAs and Guaranteed Income',
    tagline: 'Where the annuity bonus, surrender schedule, and roll-up actually live in the math.',
    cast: 'joneses',
    learningGoal:
      'Annuity bonuses boost the IRA balance you\'re converting from, surrender schedules cap how much you can pull penalty-free in early years, and GI roll-ups grow the income base — all of which interact with conversion timing.',
    estimatedMinutes: 8,
    status: 'stub',
  },
  {
    slug: 'reading-a-report',
    order: 8,
    title: 'Reading a Retirement Expert Report End-to-End',
    tagline: 'Capstone: every column, every chart, what to point at when the client asks "why?"',
    cast: 'joneses',
    learningGoal:
      'I can take a finished Retirement Expert report and explain every chart, every summary number, and every key column to a client without hesitation.',
    estimatedMinutes: 10,
    status: 'stub',
  },
];

export function getModule(slug: string): TheoryModule | undefined {
  return THEORY_MODULES.find((m) => m.slug === slug);
}

export function getNextModule(slug: string): TheoryModule | undefined {
  const i = THEORY_MODULES.findIndex((m) => m.slug === slug);
  if (i === -1 || i === THEORY_MODULES.length - 1) return undefined;
  return THEORY_MODULES[i + 1];
}

export function getPrevModule(slug: string): TheoryModule | undefined {
  const i = THEORY_MODULES.findIndex((m) => m.slug === slug);
  if (i <= 0) return undefined;
  return THEORY_MODULES[i - 1];
}
