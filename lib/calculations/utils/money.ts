/**
 * Money Utility Functions
 * Handles conversion between cents (storage) and dollars (display)
 */

/**
 * Converts cents to dollars
 * @param cents - Amount in cents
 * @returns Amount in dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Converts dollars to cents
 * @param dollars - Amount in dollars
 * @returns Amount in cents (rounded to nearest integer)
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Formats cents as a currency string
 * @param cents - Amount in cents
 * @returns Formatted string like "$1,234.56"
 */
export function formatCurrency(cents: number): string {
  const dollars = centsToDollars(cents);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Formats cents as a whole dollar amount (no cents)
 * @param cents - Amount in cents
 * @returns Formatted string like "$1,235"
 */
export function formatWholeDollars(cents: number): string {
  const dollars = Math.round(centsToDollars(cents));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}
