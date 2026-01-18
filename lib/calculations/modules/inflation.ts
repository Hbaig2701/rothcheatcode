/**
 * Adjust a value for inflation over time
 * @param baseValue Starting value in cents
 * @param years Number of years to inflate
 * @param rate Annual inflation rate as decimal (default 2.5%)
 */
export function adjustForInflation(
  baseValue: number,
  years: number,
  rate: number = 0.025
): number {
  if (years <= 0) return baseValue;
  const factor = Math.pow(1 + rate, years);
  return Math.round(baseValue * factor);
}

/**
 * Get cumulative inflation factor
 */
export function getInflationFactor(years: number, rate: number = 0.025): number {
  return Math.pow(1 + rate, years);
}

/**
 * Deflate a future value to present value
 */
export function deflateForInflation(
  futureValue: number,
  years: number,
  rate: number = 0.025
): number {
  if (years <= 0) return futureValue;
  const factor = Math.pow(1 + rate, years);
  return Math.round(futureValue / factor);
}
