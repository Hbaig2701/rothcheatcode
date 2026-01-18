// Main simulation API
export { runSimulation, createSimulationInput } from './engine';

// Types
export type {
  SimulationInput,
  SimulationResult,
  YearlyResult,
  FederalTaxResult,
  StateTaxResult,
  RMDResult,
  NIITResult,
  IRMAAResult,
  SSTaxResult,
  TaxBracket,
  FilingStatus
} from './types';

// Utilities
export { calculateAge, getRMDStartAge } from './utils/age';
export { centsToDollars, dollarsToCents, formatCurrency } from './utils/money';

// Individual modules (for testing)
export { calculateRMD } from './modules/rmd';
export { calculateFederalTax, calculateTaxableIncome } from './modules/federal-tax';
export { calculateStateTax } from './modules/state-tax';
export { calculateNIIT } from './modules/niit';
export { calculateIRMAA } from './modules/irmaa';
export { calculateSSTaxableAmount } from './modules/social-security';
export { checkACACliff, calculateACAImpact, calculateACASubsidy, calculateConversionSubsidyImpact } from './modules/aca';
export type { ACASubsidyResult } from './modules/aca';
export { adjustForInflation, getInflationFactor, deflateForInflation } from './modules/inflation';

// Multi-Strategy Comparison (Phase 06)
export { runMultiStrategySimulation } from './multi-strategy';
export { STRATEGY_DEFINITIONS, STRATEGIES, STRATEGY_PRIORITY } from './strategy-definitions';
export type { StrategyDefinition } from './strategy-definitions';
export type {
  StrategyType,
  StrategyComparisonMetrics,
  MultiStrategyResult
} from './types';

// Widow scenario (Phase 08)
export { runWidowScenario } from './scenarios/widow';
export type { WidowScenarioInput } from './scenarios/widow';

// Analysis Module (Phase 08)
export { analyzeBreakEven } from './analysis/breakeven';
export { analyzeWidowPenalty, calculateWidowTaxImpact } from './analysis/widow-penalty';
export {
  runSensitivityAnalysis,
  SENSITIVITY_SCENARIOS,
  SCENARIO_COLORS,
  getScenario,
  getScenarioColor,
  formatSensitivitySummary
} from './analysis/sensitivity';
export type {
  BreakEvenAnalysis,
  CrossoverPoint,
  SensitivityScenario,
  SensitivityResult,
  WidowTaxImpact,
  WidowAnalysisResult
} from './analysis/types';
