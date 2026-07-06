import type { Client, NonSSIIncomeEntry } from '@/lib/types/client';
import { calculateRMD } from '@/lib/calculations/modules/rmd';
import { getBirthYear, getBirthYearFromAge, getAgeAtYearOffset } from '@/lib/calculations/utils/age';
import { getNonSSIIncomeForYear, getTaxExemptIncomeForYear } from '@/lib/calculations/utils/income';

/**
 * Held-back Traditional IRA — income-only overlay.
 *
 * When the advisor marks RMDs as handled externally AND enters a held-back IRA
 * balance (money kept as a plain Traditional IRA outside this annuity, e.g. at
 * Fidelity), we auto-compute that IRA's RMD each year — growing and DEPLETING
 * the balance so the RMD amount is correct year to year — and fold it into the
 * client's non-SSI ordinary income for BOTH the baseline and the strategy. That
 * makes the Roth conversion get taxed on TOP of the real RMD income (correct
 * marginal brackets, SS-torpedo, IRMAA) instead of in a vacuum, via the existing
 * Other-Income → conversion-bracket path — no engine change needed.
 *
 * This is the income-only tier: the held-back balance's own wealth and heir tax
 * are intentionally NOT added to the net-worth totals (they're identical on both
 * sides, so they wash out of the "Additional Lifetime Wealth" delta). Returns the
 * client unchanged when the feature is off, so existing cases are byte-identical.
 *
 * IMPORTANT: this is INDEPENDENT of `rmds_handled_externally`. The held-back IRA
 * is a SEPARATE account from the converting slice, so the slice must keep
 * modeling its OWN RMDs (do-nothing has them, the conversion reduces them) while
 * this overlay adds the held-back account's RMDs on top. Gating this on the
 * "RMDs handled externally" toggle (which zeroes the slice's RMDs) understates
 * the do-nothing baseline for a partial conversion — verified $556K too low on a
 * $3M/$1.5M case. So the only gate is a positive held-back balance.
 */
export function applyHeldBackIraRmd(client: Client): Client {
  const startBalance = client.held_back_ira_balance ?? 0;
  if (startBalance <= 0) return client;

  const currentYear = new Date().getFullYear();
  const clientAge = client.age && client.age > 0 ? client.age : 62;
  const projectionYears = client.age && client.end_age
    ? client.end_age - client.age
    : (client.projection_years ?? 30);
  const birthYear = client.date_of_birth
    ? getBirthYear(client.date_of_birth)
    : getBirthYearFromAge(clientAge, currentYear);
  const growthRate = ((client.held_back_ira_growth_rate ?? client.rate_of_return ?? 0)) / 100;

  // Grow + RMD-deplete the held-back balance year by year. RMD is taken on the
  // beginning-of-year balance (calculateRMD returns 0 before the client's SECURE
  // 2.0 start age), then the remainder grows — mirroring the engines' order.
  const rmdByYear = new Map<number, number>();
  let balance = startBalance;
  for (let offset = 0; offset < projectionYears; offset++) {
    const age = getAgeAtYearOffset(clientAge, offset);
    const { rmdAmount } = calculateRMD({ age, traditionalBalance: balance, birthYear });
    if (rmdAmount > 0) {
      rmdByYear.set(currentYear + offset, rmdAmount);
      balance -= rmdAmount;
    }
    balance += Math.round(balance * growthRate);
  }
  if (rmdByYear.size === 0) return client;

  // Merge into a full per-year non-SSI income table, preserving the client's
  // existing income (flat field OR table — getNonSSIIncomeForYear handles both)
  // and adding the held-back RMD on top. Building the table folds in the flat
  // field so nothing is dropped (the table takes priority over the flat field).
  const merged: NonSSIIncomeEntry[] = [];
  for (let offset = 0; offset < projectionYears; offset++) {
    const year = currentYear + offset;
    const rmd = rmdByYear.get(year) ?? 0;
    const existingGross = getNonSSIIncomeForYear(client, year);
    const existingExempt = getTaxExemptIncomeForYear(client, year);
    if (existingGross === 0 && existingExempt === 0 && rmd === 0) continue;
    merged.push({
      year,
      age: getAgeAtYearOffset(clientAge, offset),
      gross_taxable: existingGross + rmd,
      tax_exempt: existingExempt,
    });
  }
  // Table now carries everything; clear the flat fields so they aren't summed
  // twice (they wouldn't be — table wins — but keep it unambiguous).
  return { ...client, non_ssi_income: merged, gross_taxable_non_ssi: 0, tax_exempt_non_ssi: 0 };
}
