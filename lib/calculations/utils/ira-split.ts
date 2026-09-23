import type { Client } from '@/lib/types/client';
import { getQlacPremium } from '@/lib/calculations/utils/qlac';
import { isNoAnnuityProduct } from '@/lib/config/products';

/**
 * How the starting Traditional IRA is carved up on the STRATEGY side, in the
 * same order the projections route applies it: the QLAC premium comes off the
 * top, then the AUM allocation is cut from what remains, and the rest is the
 * slice that actually funds the annuity (and therefore earns the premium
 * bonus). Display surfaces (dashboard, PDF) that quote "bonus received" or the
 * year-1 starting balance must use these figures — the full IRA overstates
 * both whenever a QLAC or AUM split is present.
 */
export interface StartingIraSplit {
  /** Full qualified_account_value, cents. */
  total: number;
  qlacPremium: number;
  aumStartingPortion: number;
  /** Slice that funds the annuity: total − QLAC − AUM. */
  rothSidePortion: number;
  /** Premium bonus dollars credited on rothSidePortion (0 for No Annuity). */
  bonusDollars: number;
  /** Strategy year-1 BOY Traditional: rothSidePortion + bonus + AUM slice. */
  strategyStartingTraditional: number;
}

export function splitStartingIra(client: Client): StartingIraSplit {
  const total = client.qualified_account_value ?? 0;
  const qlacPremium = getQlacPremium(client);
  const afterQlac = total - qlacPremium;
  const aumStartingPortion = Math.round(afterQlac * ((client.aum_allocation_percent ?? 0) / 100));
  const rothSidePortion = afterQlac - aumStartingPortion;
  const bonusPct = isNoAnnuityProduct(client.blueprint_type) ? 0 : (client.bonus_percent ?? 0);
  const bonusDollars = Math.round(rothSidePortion * (bonusPct / 100));
  return {
    total,
    qlacPremium,
    aumStartingPortion,
    rothSidePortion,
    bonusDollars,
    strategyStartingTraditional: rothSidePortion + bonusDollars + aumStartingPortion,
  };
}
