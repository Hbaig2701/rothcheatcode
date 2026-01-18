/**
 * US State Tax Data
 * Source: Tax Foundation 2025 State Tax Rates
 * https://taxfoundation.org/data/all/state/state-income-tax-rates/
 */

export interface StateInfo {
  code: string;
  name: string;
  taxType: "none" | "flat" | "progressive";
  topRate: number; // percentage, e.g., 13.30 for California
  brackets?: number; // number of brackets if progressive
}

export const US_STATES: StateInfo[] = [
  // No income tax states (8)
  { code: "AK", name: "Alaska", taxType: "none", topRate: 0 },
  { code: "FL", name: "Florida", taxType: "none", topRate: 0 },
  { code: "NV", name: "Nevada", taxType: "none", topRate: 0 },
  { code: "NH", name: "New Hampshire", taxType: "none", topRate: 0 },
  { code: "SD", name: "South Dakota", taxType: "none", topRate: 0 },
  { code: "TN", name: "Tennessee", taxType: "none", topRate: 0 },
  { code: "TX", name: "Texas", taxType: "none", topRate: 0 },
  { code: "WY", name: "Wyoming", taxType: "none", topRate: 0 },

  // Flat tax states (14)
  { code: "AZ", name: "Arizona", taxType: "flat", topRate: 2.5 },
  { code: "CO", name: "Colorado", taxType: "flat", topRate: 4.4 },
  { code: "GA", name: "Georgia", taxType: "flat", topRate: 5.39 },
  { code: "ID", name: "Idaho", taxType: "flat", topRate: 5.695 },
  { code: "IL", name: "Illinois", taxType: "flat", topRate: 4.95 },
  { code: "IN", name: "Indiana", taxType: "flat", topRate: 3.0 },
  { code: "IA", name: "Iowa", taxType: "flat", topRate: 3.8 },
  { code: "KY", name: "Kentucky", taxType: "flat", topRate: 4.0 },
  { code: "LA", name: "Louisiana", taxType: "flat", topRate: 3.0 },
  { code: "MI", name: "Michigan", taxType: "flat", topRate: 4.25 },
  { code: "MS", name: "Mississippi", taxType: "flat", topRate: 4.4 },
  { code: "NC", name: "North Carolina", taxType: "flat", topRate: 4.25 },
  { code: "PA", name: "Pennsylvania", taxType: "flat", topRate: 3.07 },
  { code: "UT", name: "Utah", taxType: "flat", topRate: 4.55 },

  // Progressive tax states (29)
  { code: "AL", name: "Alabama", taxType: "progressive", topRate: 5.0, brackets: 3 },
  { code: "AR", name: "Arkansas", taxType: "progressive", topRate: 3.9, brackets: 2 },
  { code: "CA", name: "California", taxType: "progressive", topRate: 13.3, brackets: 9 },
  { code: "CT", name: "Connecticut", taxType: "progressive", topRate: 6.99, brackets: 7 },
  { code: "DE", name: "Delaware", taxType: "progressive", topRate: 6.6, brackets: 6 },
  { code: "DC", name: "District of Columbia", taxType: "progressive", topRate: 10.75, brackets: 6 },
  { code: "HI", name: "Hawaii", taxType: "progressive", topRate: 11.0, brackets: 12 },
  { code: "KS", name: "Kansas", taxType: "progressive", topRate: 5.58, brackets: 2 },
  { code: "ME", name: "Maine", taxType: "progressive", topRate: 7.15, brackets: 3 },
  { code: "MD", name: "Maryland", taxType: "progressive", topRate: 5.75, brackets: 8 },
  { code: "MA", name: "Massachusetts", taxType: "progressive", topRate: 9.0, brackets: 2 },
  { code: "MN", name: "Minnesota", taxType: "progressive", topRate: 9.85, brackets: 4 },
  { code: "MO", name: "Missouri", taxType: "progressive", topRate: 4.7, brackets: 7 },
  { code: "MT", name: "Montana", taxType: "progressive", topRate: 5.9, brackets: 2 },
  { code: "NE", name: "Nebraska", taxType: "progressive", topRate: 5.2, brackets: 4 },
  { code: "NJ", name: "New Jersey", taxType: "progressive", topRate: 10.75, brackets: 7 },
  { code: "NM", name: "New Mexico", taxType: "progressive", topRate: 5.9, brackets: 6 },
  { code: "NY", name: "New York", taxType: "progressive", topRate: 10.9, brackets: 9 },
  { code: "ND", name: "North Dakota", taxType: "progressive", topRate: 2.5, brackets: 2 },
  { code: "OH", name: "Ohio", taxType: "progressive", topRate: 3.5, brackets: 2 },
  { code: "OK", name: "Oklahoma", taxType: "progressive", topRate: 4.75, brackets: 6 },
  { code: "OR", name: "Oregon", taxType: "progressive", topRate: 9.9, brackets: 4 },
  { code: "RI", name: "Rhode Island", taxType: "progressive", topRate: 5.99, brackets: 3 },
  { code: "SC", name: "South Carolina", taxType: "progressive", topRate: 6.2, brackets: 3 },
  { code: "VT", name: "Vermont", taxType: "progressive", topRate: 8.75, brackets: 4 },
  { code: "VA", name: "Virginia", taxType: "progressive", topRate: 5.75, brackets: 4 },
  { code: "WA", name: "Washington", taxType: "progressive", topRate: 7.0, brackets: 1 }, // Capital gains only
  { code: "WV", name: "West Virginia", taxType: "progressive", topRate: 4.82, brackets: 5 },
  { code: "WI", name: "Wisconsin", taxType: "progressive", topRate: 7.65, brackets: 4 },
];

/**
 * Get state info by 2-letter code
 */
export function getStateByCode(code: string): StateInfo | undefined {
  return US_STATES.find((s) => s.code === code.toUpperCase());
}

/**
 * Get the default (top marginal) tax rate for a state
 * Returns 0 for no-income-tax states
 */
export function getDefaultStateTaxRate(code: string): number {
  const state = getStateByCode(code);
  return state?.topRate ?? 0;
}
