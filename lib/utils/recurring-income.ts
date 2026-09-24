/**
 * Year-by-year amounts for the income table's "Recurring" bulk fill.
 *
 * The fill used to repeat one flat figure, so an advisor modelling income that
 * grows — dividends, rent, a COLA'd pension — had to type every row by hand
 * (Airinhos Serradas entered 34 identical rows before asking for this).
 *
 * The entered amount is year one; each later year compounds by `growthPercent`.
 * 0% reproduces the old flat fill exactly.
 */

export interface RecurringIncomeRow {
  year: number;
  grossCents: number;
  exemptCents: number;
}

export function buildRecurringIncomeRows(input: {
  startYear: number;
  endYear: number;
  grossCents: number;
  exemptCents: number;
  growthPercent: number;
}): RecurringIncomeRow[] {
  const { startYear, endYear, grossCents, exemptCents, growthPercent } = input;
  const rows: RecurringIncomeRow[] = [];
  if (endYear < startYear) return rows;

  const factor = 1 + growthPercent / 100;
  for (let year = startYear; year <= endYear; year++) {
    // Scale from the START amount each year rather than compounding the
    // previous row, so rounding to whole cents can't accumulate drift.
    const scale = growthPercent === 0 ? 1 : Math.pow(factor, year - startYear);
    rows.push({
      year,
      grossCents: Math.round(grossCents * scale),
      exemptCents: Math.round(exemptCents * scale),
    });
  }
  return rows;
}

/**
 * Escalation implied by two consecutive rows, as a percentage to one decimal.
 * Used to prefill the panel so reopening it and hitting Fill doesn't silently
 * flatten a schedule that was already growing. Returns 0 when the rows don't
 * describe a clean, plausible increase.
 */
export function inferGrowthPercent(firstGrossCents: number, secondGrossCents: number): number {
  if (firstGrossCents <= 0 || secondGrossCents <= firstGrossCents) return 0;
  const pct = Math.round((secondGrossCents / firstGrossCents - 1) * 1000) / 10;
  return pct > 0 && pct <= 20 ? pct : 0;
}
