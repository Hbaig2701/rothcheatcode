import type { Client, WithdrawalEntry } from "@/lib/types/client";

/**
 * Resolve voluntary withdrawals for a given year against the available
 * IRA and Roth balances at the moment the withdrawal happens.
 *
 * Inputs:
 *   - client.withdrawals: per-year schedule (optional, default [])
 *   - availableIRA: IRA balance at the moment of withdrawal — callers should
 *     pass the FULL beginning-of-year IRA. Voluntary IRA pulls satisfy the
 *     RMD up to their amount (IRS rule), so the caller nets the result
 *     against the RMD requirement; voluntary is NOT layered on top.
 *   - availableRoth: Roth balance at the moment of withdrawal
 *
 * Returns the actual amounts pulled from each bucket. The caller is
 * responsible for applying these (subtracting from balances, netting against
 * the RMD requirement to derive the taxable IRA distribution, applying any
 * 10% early-withdrawal penalty).
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

/**
 * Sum the user's voluntary withdrawal request for `year` that targets the
 * QUALIFIED side (i.e. would normally come from the IRA). The AUM bucket
 * holds the post-tax destination of qualified-money transfers, so when the
 * Roth-side IRA balance can't satisfy these (typical with a high
 * `aum_allocation_percent`), the AUM brokerage absorbs the shortfall.
 *
 * Sources counted:
 *   - 'ira'  → explicit IRA pull
 *   - 'auto' → defaults to "Roth first, then IRA"; the IRA-tail of an auto
 *     entry can land here when Roth is dry
 *
 * Sources NOT counted: 'roth' (means specifically the Roth IRA — the AUM
 * brokerage is not a Roth and shouldn't be used as a substitute).
 */
/**
 * After-tax (net) IRA withdrawal target for `year` — the sum of net-flagged
 * withdrawal amounts that land on the IRA (source 'ira' or 'auto'). Roth-source
 * entries are excluded: Roth withdrawals are tax-free, so net == gross and there
 * is nothing to gross up. Returns 0 when no net-flagged IRA withdrawal exists
 * (the common case), so the caller stays on the byte-identical gross path.
 *
 * Only the BASELINE ("do nothing") side grosses this up — see baseline.ts. The
 * strategy pulls from the tax-free Roth, where net already equals gross.
 */
export function netIraTargetForYear(
  client: { withdrawals?: WithdrawalEntry[] },
  year: number,
): number {
  const list = client.withdrawals ?? [];
  let total = 0;
  for (const e of list) {
    if (e.year !== year || !e.net) continue;
    if (e.source === 'roth') continue; // tax-free — net == gross
    total += Math.max(0, Math.round(e.amount ?? 0));
  }
  return total;
}

export function requestedFromQualifiedForYear(
  client: { withdrawals?: Array<{ year: number; amount?: number; source?: 'ira' | 'roth' | 'auto' }> },
  year: number,
): number {
  const list = client.withdrawals ?? [];
  let total = 0;
  for (const e of list) {
    if (e.year !== year) continue;
    const amt = Math.max(0, Math.round(e.amount ?? 0));
    if (amt === 0) continue;
    if (e.source === 'roth') continue;
    total += amt;
  }
  return total;
}
