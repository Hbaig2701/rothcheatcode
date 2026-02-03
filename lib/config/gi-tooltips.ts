// Tooltip text for Guaranteed Income output fields
// Used on the GI reporting page only

export const GI_TOOLTIPS = {
  // ============================================
  // CONVERSION INSIGHTS
  // ============================================

  initialBalance:
    "The amount of money being moved into this annuity\u2014your starting investment.",

  incomeStartAge:
    "The age when your guaranteed income payments begin. Waiting longer typically means higher payments.",

  guaranteedAnnualIncome:
    "The amount you\u2019ll receive every year for life once income payments begin, regardless of market performance.",

  lifetimeWealthBefore:
    "Your projected total wealth over your lifetime if you do NOT use this Roth conversion strategy.",

  lifetimeWealthAfter:
    "Your projected total wealth over your lifetime if you DO use this Roth conversion strategy.",

  percentChange:
    "How much more (or less) lifetime wealth you could have by using this strategy compared to doing nothing.",

  // ============================================
  // GUARANTEED INCOME SUMMARY - Income Overview
  // ============================================

  payoutPercentage:
    "The percentage of your Income Base that you\u2019ll receive each year for life. This rate is locked in when you start taking income.",

  annualIncomeGross:
    "Your yearly income payment before any taxes are taken out.",

  annualIncomeNet:
    "Your yearly income payment after taxes\u2014what you actually keep.",

  accountDepletionAge:
    "The age when your actual account value (real cash) is projected to run out. After this, your income continues but there\u2019s no lump sum left.",

  incomeAfterDepletion:
    "What happens after your account value hits zero. \"Continues\" means the insurance company keeps paying you for life\u2014that\u2019s the guarantee.",

  // ============================================
  // GUARANTEED INCOME SUMMARY - Income Base
  // ============================================

  incomeBaseAtStart:
    "Your Income Base when the policy begins. This includes any bonus applied to the base (not the same as your real cash value).",

  incomeBaseAtIncomeStart:
    "Your Income Base at the moment you start taking income. This is the number used to calculate your lifetime payments.",

  incomeBaseGrowth:
    "How much your Income Base grew during the deferral period due to the guaranteed roll-up rate.",

  rollUpRate:
    "The guaranteed growth rate applied to your Income Base each year you wait before taking income. This is NOT market growth\u2014it\u2019s a contractual guarantee.",

  // ============================================
  // GUARANTEED INCOME SUMMARY - Lifetime Totals
  // ============================================

  totalGrossPaid:
    "The total amount of income payments you\u2019re projected to receive over your lifetime, before taxes.",

  totalNetPaid:
    "The total income you\u2019re projected to actually keep after taxes over your lifetime.",

  totalRiderFees:
    "The cumulative cost of the income rider guarantee over the life of the contract. This fee is deducted from your account value annually.",

  effectiveTaxRate:
    "The average tax rate applied to your income payments over your lifetime, accounting for your tax bracket and any Roth conversion benefits.",
} as const;
