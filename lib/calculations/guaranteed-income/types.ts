/**
 * Guaranteed Income calculation types
 * All monetary values are in cents (integers) to avoid floating-point errors
 */

// The 4-phase GI architecture
export type GIPhase = 'conversion' | 'purchase' | 'deferral' | 'income';

export interface GIYearData {
  year: number;
  age: number;
  phase: GIPhase;

  // Conversion phase data
  traditionalBalance: number;       // Traditional IRA balance (cents)
  rothBalance: number;              // Roth IRA balance (cents)
  conversionAmount: number;         // Amount converted this year (cents)
  conversionTax: number;            // Tax paid on conversion (cents)

  // GI-specific (deferral + income phases)
  accountValue: number;             // GI Account Value (cents)
  incomeBase: number;               // GI Income Base (cents)
  guaranteedIncomeGross: number;    // Annual GI payment (cents, 0 during non-income phases)
  guaranteedIncomeNet: number;      // After-tax GI (cents, 0 during non-income phases)
  riderFee: number;                 // Annual rider fee deducted (cents)
  cumulativeIncome: number;         // Running total of net income received (cents)
}

// Comparison metrics between Strategy (Roth GI) and Baseline (Traditional GI)
export interface GIComparisonMetrics {
  // Strategy (Roth GI) - tax-free income
  strategyAnnualIncomeGross: number;   // Annual income (cents)
  strategyAnnualIncomeNet: number;     // Same as gross - tax-free! (cents)
  strategyLifetimeIncomeGross: number; // Lifetime total (cents)
  strategyLifetimeIncomeNet: number;   // Same as gross (cents)
  strategyTotalConversionTax: number;  // Total conversion taxes paid (cents)
  strategyIncomeBase: number;          // Final income base at income start (cents)

  // Baseline (Traditional GI) - taxable income
  baselineAnnualIncomeGross: number;   // Annual income before tax (cents)
  baselineAnnualIncomeNet: number;     // Annual income after tax (cents)
  baselineLifetimeIncomeGross: number; // Lifetime total before tax (cents)
  baselineLifetimeIncomeNet: number;   // Lifetime total after tax (cents)
  baselineAnnualTax: number;           // Annual tax on income (cents)
  baselineIncomeBase: number;          // Income base at income start (cents)

  // Comparison derived metrics
  annualIncomeAdvantage: number;       // Strategy Net - Baseline Net (cents)
  lifetimeIncomeAdvantage: number;     // Lifetime difference (cents)
  taxFreeWealthCreated: number;        // Total benefit = lifetime advantage (cents)
  breakEvenYears: number | null;       // Conversion Tax / Annual Advantage
  breakEvenAge: number | null;         // Age when strategy recovers conversion cost
  percentImprovement: number;          // (taxFreeWealthCreated / baselineLifetimeNet) * 100
}

export interface GIMetrics {
  // Core metrics
  annualIncomeGross: number;        // Annual GI payment (cents)
  annualIncomeNet: number;          // After-tax annual GI (cents) - same as gross for Roth GI
  incomeStartAge: number;
  depletionAge: number | null;      // Age when account value hits $0 (null if never)
  incomeBaseAtStart: number;        // Income base on day 1 (cents)
  incomeBaseAtIncomeAge: number;    // Income base when income begins (cents)
  totalGrossPaid: number;           // Lifetime gross GI payments (cents)
  totalNetPaid: number;             // Lifetime after-tax GI payments (cents)
  yearlyData: GIYearData[];         // Year-by-year GI tracking
  totalRiderFees: number;           // Lifetime rider fees paid (cents)
  payoutPercent: number;            // Payout percentage used (e.g. 6.60)
  rollUpDescription: string;        // Human-readable roll-up description
  bonusAmount: number;              // Bonus amount applied (cents)
  bonusAppliesTo: string | null;    // Where bonus was applied (for display)

  // New 4-phase model fields
  conversionPhaseYears: number;     // Number of years in conversion phase
  purchaseAge: number;              // Age when GI was purchased
  purchaseAmount: number;           // Roth balance used to buy GI (cents)
  totalConversionTax: number;       // Total taxes paid during conversions (cents)
  deferralYears: number;            // Years between purchase and income start

  // Comparison with baseline
  comparison: GIComparisonMetrics;

  // Baseline GI data for comparison charts
  baselineYearlyData: GIYearData[];
}

// Strategy-specific metrics during calculation
export interface GIStrategyMetrics {
  annualIncomeGross: number;
  annualIncomeNet: number;
  lifetimeIncomeGross: number;
  lifetimeIncomeNet: number;
  totalConversionTax: number;
  incomeStartAge: number;
  incomeBaseAtIncomeAge: number;
  purchaseAge: number;
  purchaseAmount: number;
  conversionPhaseYears: number;
  deferralYears: number;
}

// Baseline-specific metrics during calculation
export interface GIBaselineMetrics {
  annualIncomeGross: number;
  annualIncomeNet: number;
  annualTax: number;
  lifetimeIncomeGross: number;
  lifetimeIncomeNet: number;
  lifetimeTax: number;
  incomeStartAge: number;
  incomeBaseAtIncomeAge: number;
  yearlyData: GIYearData[];
}
