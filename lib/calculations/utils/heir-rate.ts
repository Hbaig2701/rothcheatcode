import type { Client } from '@/lib/types/client';

export const DEFAULT_HEIR_TAX_RATE = 40;

/**
 * Heir tax rate as a DECIMAL, resolved the way the standard engine's
 * calculateHeirBenefit always has: heir_tax_rate when set (> 0), else the
 * legacy heir_bracket string, else 40%. Every post-engine overlay that charges
 * heir tax (QLAC death benefit) must use this so it agrees with the engine on
 * legacy clients whose heir_tax_rate is null but heir_bracket is set.
 */
export function resolveHeirTaxRate(client: { heir_tax_rate?: Client['heir_tax_rate']; heir_bracket?: Client['heir_bracket'] }): number {
  const rate = client.heir_tax_rate;
  if (rate !== undefined && rate !== null && rate > 0) return rate / 100;
  if (client.heir_bracket) {
    const parsed = parseInt(client.heir_bracket, 10);
    if (parsed > 0) return parsed / 100;
  }
  return DEFAULT_HEIR_TAX_RATE / 100;
}
