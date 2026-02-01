import { StrategyType } from './types';

/**
 * Configuration for a Roth conversion strategy
 */
export interface StrategyDefinition {
  name: string;              // Display name
  description: string;       // Brief explanation
  targetBracket: number;     // Fill up to this federal tax bracket %
  irmaaAvoidance: boolean;   // Try to stay below IRMAA thresholds
  strictIRMAA: boolean;      // Hard cap at IRMAA threshold
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Centralized strategy configurations
 * Used by:
 * - CheatCode scenario to determine conversion amounts
 * - Comparison table to display strategy names/descriptions
 * - Best strategy determination for tie-breaking by risk
 */
export const STRATEGY_DEFINITIONS: Record<StrategyType, StrategyDefinition> = {
  conservative: {
    name: 'Conservative',
    description: 'Stay within current tax bracket',
    targetBracket: 22,
    irmaaAvoidance: true,
    strictIRMAA: false,
    riskLevel: 'low'
  },
  moderate: {
    name: 'Moderate',
    description: 'Fill up to next bracket',
    targetBracket: 24,
    irmaaAvoidance: true,
    strictIRMAA: false,
    riskLevel: 'medium'
  },
  aggressive: {
    name: 'Aggressive',
    description: 'Fill up to 32% bracket',
    targetBracket: 32,
    irmaaAvoidance: false,
    strictIRMAA: false,
    riskLevel: 'high'
  },
  irmaa_safe: {
    name: 'IRMAA-Safe',
    description: 'Stay below Medicare surcharges',
    targetBracket: 24,
    irmaaAvoidance: true,
    strictIRMAA: true,
    riskLevel: 'low'
  }
};

/**
 * Ordered list of strategies for iteration
 * Order: by display position in comparison table
 */
export const STRATEGIES: StrategyType[] = [
  'conservative',
  'moderate',
  'aggressive',
  'irmaa_safe'
];

/**
 * Priority order for tie-breaking (lower index = preferred)
 * Used when two strategies have identical ending wealth
 */
export const STRATEGY_PRIORITY: StrategyType[] = [
  'irmaa_safe',     // Lowest risk, preferred on tie
  'conservative',   // Low risk
  'moderate',       // Medium risk
  'aggressive'      // Highest risk, least preferred on tie
];
