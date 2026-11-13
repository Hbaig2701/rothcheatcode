/**
 * The taxable brokerage vs. idle RMD cash.
 *
 * rmd_treatment decides what happens to forced-RMD cash — reinvested in the
 * brokerage, left sitting in cash, or spent. It says nothing about the client's
 * OWN taxable account, which earns the market rate in every mode. Engines keep
 * one taxableBalance, so in 'cash' mode they also track how much of it is idle
 * RMD cash (taxableCash) and exclude only that from growth.
 *
 * Money drawn from the taxable account (conversion tax, IRMAA, fees) comes out
 * of the invested portion first; the idle cash shrinks only once the invested
 * portion is gone. That keeps "RMDs accumulate in cash" literally true and
 * needs no per-debit bookkeeping at each call site.
 */
export function brokerageInterest(boyTaxable: number, boyTaxableCash: number, rate: number): number {
  return Math.round(Math.max(0, boyTaxable - boyTaxableCash) * rate);
}

/** Idle RMD cash at end of year. Always 0 outside 'cash' mode. */
export function nextTaxableCash(
  rmdTreatment: string,
  boyTaxableCash: number,
  rmdCashIn: number,
  eoyTaxableBalance: number,
): number {
  if (rmdTreatment !== 'cash') return 0;
  return Math.max(0, Math.min(boyTaxableCash + Math.max(0, rmdCashIn), eoyTaxableBalance));
}
