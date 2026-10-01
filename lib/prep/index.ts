import { computePrepFacts } from './compute';
import { buildWarnings } from './rules';
import type { PrepInput, PrepResult } from './types';

export * from './types';
export { computePrepFacts } from './compute';
export { buildWarnings } from './rules';
export { renderText } from './render-text';

/**
 * Build the brief, or refuse.
 *
 * Refusing is a feature. The guaranteed-income engine reuses the same
 * YearlyResult fields to mean different things — `rmdAmount` carries the
 * annuity payout, `traditionalBalance` carries the annuity's account value —
 * so a brief built from those rows tells the advisor the government is forcing
 * a withdrawal that is really their own income, and that heirs inherit $0.
 * Both sentences are false and an advisor would repeat them to a client.
 *
 * Until the copy is GI-aware, GI clients get no brief rather than a wrong one.
 */
export function buildPrepSheet(input: PrepInput): PrepResult {
  if (input.engine === 'gi') {
    return {
      supported: false,
      reason:
        'Pre-Meeting Prep does not yet cover guaranteed income products — the income payouts and death benefit need their own wording.',
    };
  }
  const facts = computePrepFacts(input);
  return {
    supported: true,
    sheet: { facts, warnings: buildWarnings(facts), generatedAt: new Date().toISOString() },
  };
}
