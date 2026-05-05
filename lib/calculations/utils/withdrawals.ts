import type { Client, WithdrawalEntry } from "@/lib/types/client";

/**
 * Resolve voluntary withdrawals for a given year against the available
 * IRA and Roth balances at the moment the withdrawal happens.
 *
 * Inputs:
 *   - client.withdrawals: per-year schedule (optional, default [])
 *   - availableIRA: IRA balance after RMD has already been deducted
 *     (RMDs come off first conceptually — voluntary withdrawals are *additional*)
 *   - availableRoth: Roth balance at the moment of withdrawal
 *
 * Returns the actual amounts pulled from each bucket. The caller is
 * responsible for applying these (subtracting from balances, adding the
 * IRA portion to taxable income, applying any 10% early-withdrawal penalty).
 *
 * Source semantics:
 *   - 'ira'  — pull from IRA only. Capped at availableIRA.
 *   - 'roth' — pull from Roth only. Capped at availableRoth.
 *   - 'auto' — pull from Roth first (tax-free), remainder from IRA. This is
 *              what makes the baseline-vs-strategy comparison "just work":
 *              baseline naturally falls to IRA (no Roth balance), strategy
 *              pulls from Roth (after conversions accumulate).
 *
 * Multiple entries for the same year are summed within their source.
 */
export function resolveWithdrawalsForYear(
  client: Client,
  year: number,
  availableIRA: number,
  availableRoth: number,
): { iraPulled: number; rothPulled: number; requested: number; shortfall: number } {
  const list: WithdrawalEntry[] = client.withdrawals ?? [];
  if (list.length === 0) {
    return { iraPulled: 0, rothPulled: 0, requested: 0, shortfall: 0 };
  }

  // Sum requested amounts by source for this year. Process 'auto' last so
  // explicit 'ira' / 'roth' rows get priority on the available balance.
  let requestedIra = 0;
  let requestedRoth = 0;
  let requestedAuto = 0;
  for (const entry of list) {
    if (entry.year !== year) continue;
    const amt = Math.max(0, Math.round(entry.amount ?? 0));
    if (amt === 0) continue;
    if (entry.source === "ira") requestedIra += amt;
    else if (entry.source === "roth") requestedRoth += amt;
    else requestedAuto += amt; // default 'auto'
  }

  let remIRA = Math.max(0, availableIRA);
  let remRoth = Math.max(0, availableRoth);

  // Pull explicit IRA + Roth first.
  const iraExplicit = Math.min(requestedIra, remIRA);
  remIRA -= iraExplicit;
  const rothExplicit = Math.min(requestedRoth, remRoth);
  remRoth -= rothExplicit;

  // Auto: prefer Roth, fall back to IRA.
  const autoFromRoth = Math.min(requestedAuto, remRoth);
  remRoth -= autoFromRoth;
  const autoLeftover = requestedAuto - autoFromRoth;
  const autoFromIra = Math.min(autoLeftover, remIRA);
  remIRA -= autoFromIra;

  const iraPulled = iraExplicit + autoFromIra;
  const rothPulled = rothExplicit + autoFromRoth;
  const requested = requestedIra + requestedRoth + requestedAuto;
  const shortfall = requested - (iraPulled + rothPulled);

  return { iraPulled, rothPulled, requested, shortfall };
}

/**
 * 10% federal early-withdrawal penalty applies to IRA distributions taken
 * before age 59.5. RMDs aren't subject (RMD start age >= 73), but voluntary
 * IRA withdrawals from the new schedule can hit it. Roth withdrawals are
 * assumed qualified — the 5-year rule + age 59.5 — and not penalized here.
 */
export function earlyWithdrawalPenaltyOnIRA(age: number, iraPulled: number): number {
  if (iraPulled <= 0 || age >= 59.5) return 0;
  return Math.round(iraPulled * 0.10);
}
