/**
 * Guaranteed Income calculation types
 * All monetary values are in cents (integers) to avoid floating-point errors
 */

export interface GIYearData {
  year: number;
  age: number;
  phase: 'deferral' | 'income';
  accountValue: number;           // In cents
  incomeBase: number;             // In cents
  guaranteedIncomeGross: number;  // In cents (0 during deferral)
  guaranteedIncomeNet: number;    // After-tax (0 during deferral)
  conversionAmount: number;       // Roth conversions during deferral only
}

export interface GIMetrics {
  annualIncomeGross: number;      // Annual GI payment (cents)
  annualIncomeNet: number;        // After-tax annual GI (cents)
  incomeStartAge: number;
  depletionAge: number | null;    // Age when account value hits $0 (null if never)
  incomeBaseAtStart: number;      // Income base on day 1 (cents)
  incomeBaseAtIncomeAge: number;  // Income base when income begins (cents)
  totalGrossPaid: number;         // Lifetime gross GI payments (cents)
  totalNetPaid: number;           // Lifetime after-tax GI payments (cents)
  yearlyData: GIYearData[];       // Year-by-year GI tracking
}
