export type PlanId = "none" | "standard" | "starter" | "pro"; // starter & pro archived, standard is active

export interface PlanLimits {
  clients: number | null; // null = unlimited
  scenarioRuns: number | null;
  pdfExports: number | null;
  teamMembers: number;
  whiteLabel: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  none: {
    clients: 0,
    scenarioRuns: 0,
    pdfExports: 0,
    teamMembers: 0,
    whiteLabel: false,
  },
  standard: {
    clients: null,
    scenarioRuns: null,
    pdfExports: null,
    teamMembers: Infinity,
    whiteLabel: true,
  },
  // ARCHIVED: Legacy plan limits (can be re-enabled)
  starter: {
    clients: 10,
    scenarioRuns: 50,
    pdfExports: 20,
    teamMembers: 0,
    whiteLabel: false,
  },
  pro: {
    clients: null,
    scenarioRuns: null,
    pdfExports: null,
    teamMembers: Infinity,
    whiteLabel: true,
  },
};

export const PLAN_PRICES = {
  standard: {
    monthly: { amount: 197, label: "$197/month" },
    annual: { amount: 1970, label: "$1,970/year (save $394)" },
  },
  // ARCHIVED: Legacy plans — can be re-enabled if needed
  // starter: {
  //   monthly: { amount: 97, label: "$97/month" },
  //   annual: { amount: 970, label: "$970/year (save $194)" },
  // },
  // pro: {
  //   monthly: { amount: 297, label: "$297/month" },
  //   annual: { amount: 2970, label: "$2,970/year (save $594)" },
  // },
} as const;

export function getStripePriceId(
  plan: "standard" | "starter" | "pro",
  cycle: "monthly" | "annual"
): string {
  const map: Record<string, string | undefined> = {
    standard_monthly: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
    standard_annual: process.env.STRIPE_PRICE_STANDARD_ANNUAL,
    // Legacy archived plans
    starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
  };
  const id = map[`${plan}_${cycle}`];
  if (!id) throw new Error(`Missing Stripe price ID for ${plan}_${cycle}`);
  return id;
}

export function getPlanFromPriceId(priceId: string): {
  plan: PlanId;
  cycle: "monthly" | "annual";
} | null {
  // Active plans
  if (priceId === process.env.STRIPE_PRICE_STANDARD_MONTHLY)
    return { plan: "standard", cycle: "monthly" };
  if (priceId === process.env.STRIPE_PRICE_STANDARD_ANNUAL)
    return { plan: "standard", cycle: "annual" };

  // Legacy archived plans (kept for backwards compatibility)
  if (priceId === process.env.STRIPE_PRICE_STARTER_MONTHLY)
    return { plan: "starter", cycle: "monthly" };
  if (priceId === process.env.STRIPE_PRICE_STARTER_ANNUAL)
    return { plan: "starter", cycle: "annual" };
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY)
    return { plan: "pro", cycle: "monthly" };
  if (priceId === process.env.STRIPE_PRICE_PRO_ANNUAL)
    return { plan: "pro", cycle: "annual" };

  console.error(
    `[getPlanFromPriceId] Unknown priceId: ${priceId}. ` +
    `Expected one of: standard_monthly=${process.env.STRIPE_PRICE_STANDARD_MONTHLY}, ` +
    `standard_annual=${process.env.STRIPE_PRICE_STANDARD_ANNUAL}. ` +
    `Skipping plan update to avoid accidental downgrade.`
  );
  return null;
}

export function getPlanLimits(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.none;
}
