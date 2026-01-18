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
export { checkACACliff, calculateACAImpact } from './modules/aca';
export { adjustForInflation, getInflationFactor, deflateForInflation } from './modules/inflation';
