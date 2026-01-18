import { getFPL, getACASubsidyCutoff } from '@/lib/data/federal-poverty';

interface ACAInput {
  magi: number;
  householdSize: number;
  state: string;
  age: number;
}

interface ACAResult {
  affectsACA: boolean;
  atSubsidyCliff: boolean;
  fplPercent: number;
  subsidyCutoff: number;
}

/**
 * Check if client is at ACA subsidy cliff (400% FPL)
 * Only applies to pre-Medicare clients (under 65)
 */
export function checkACACliff(input: ACAInput): ACAResult {
  // Medicare eligible - ACA doesn't apply
  if (input.age >= 65) {
    return {
      affectsACA: false,
      atSubsidyCliff: false,
      fplPercent: 0,
      subsidyCutoff: 0
    };
  }

  const fpl = getFPL(input.householdSize, input.state);
  const subsidyCutoff = getACASubsidyCutoff(input.householdSize, input.state);
  const fplPercent = (input.magi / fpl) * 100;

  return {
    affectsACA: true,
    atSubsidyCliff: input.magi > subsidyCutoff,
    fplPercent,
    subsidyCutoff
  };
}

/**
 * Calculate impact of Roth conversion on ACA subsidy
 */
export function calculateACAImpact(
  baseMAGI: number,
  conversionAmount: number,
  householdSize: number,
  state: string
): { crossesCliff: boolean; estimatedLoss: number } {
  const cutoff = getACASubsidyCutoff(householdSize, state);
  const newMAGI = baseMAGI + conversionAmount;

  const crossesCliff = baseMAGI <= cutoff && newMAGI > cutoff;

  // Rough estimate: $8,000-$15,000/year subsidy loss for a couple
  const estimatedLoss = crossesCliff ? 1200000 : 0; // $12,000 estimate

  return { crossesCliff, estimatedLoss };
}
