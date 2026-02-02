/**
 * US State Tax Data
 * Source: Roth Formula Specification v1.0
 *
 * Note: These are effective/simplified rates used for Roth conversion calculations.
 * For states with progressive systems, these represent reasonable effective rates.
 */

export interface StateInfo {
  code: string;
  name: string;
  taxType: "none" | "flat" | "progressive";
  topRate: number; // percentage, e.g., 9.30 for California
  brackets?: number; // number of brackets if progressive
}

/**
 * State Tax Rates Lookup by Name
 * These rates are used for simplified state tax calculations on Roth conversions
 * Values as decimals (e.g., 0.05 = 5%)
 */
export const STATE_TAX_RATES: Record<string, number> = {
  'Alabama': 0.05,
  'Alaska': 0.00,
  'Arizona': 0.025,
  'Arkansas': 0.047,
  'California': 0.0930,  // Top marginal rate
  'Colorado': 0.044,
  'Connecticut': 0.0699,
  'Delaware': 0.066,
  'Florida': 0.00,
  'Georgia': 0.055,
  'Hawaii': 0.11,
  'Idaho': 0.058,
  'Illinois': 0.0495,
  'Indiana': 0.0315,
  'Iowa': 0.06,
  'Kansas': 0.057,
  'Kentucky': 0.045,
  'Louisiana': 0.0425,
  'Maine': 0.0715,
  'Maryland': 0.0575,
  'Massachusetts': 0.05,
  'Michigan': 0.0425,
  'Minnesota': 0.0985,
  'Mississippi': 0.05,
  'Missouri': 0.048,
  'Montana': 0.059,
  'Nebraska': 0.0664,
  'Nevada': 0.00,
  'New Hampshire': 0.00,  // No income tax on wages/retirement
  'New Jersey': 0.1075,
  'New Mexico': 0.059,
  'New York': 0.109,
  'North Carolina': 0.0475,
  'North Dakota': 0.029,
  'Ohio': 0.0399,
  'Oklahoma': 0.0475,
  'Oregon': 0.099,
  'Pennsylvania': 0.0307,
  'Rhode Island': 0.0599,
  'South Carolina': 0.064,
  'South Dakota': 0.00,
  'Tennessee': 0.00,
  'Texas': 0.00,
  'Utah': 0.0485,
  'Vermont': 0.0875,
  'Virginia': 0.0575,
  'Washington': 0.00,  // No regular income tax (capital gains only)
  'West Virginia': 0.055,
  'Wisconsin': 0.0765,
  'Wyoming': 0.00,
  'District of Columbia': 0.1075
};

/**
 * State code to name mapping
 */
export const STATE_CODE_TO_NAME: Record<string, string> = {
  'AK': 'Alaska',
  'AL': 'Alabama',
  'AR': 'Arkansas',
  'AZ': 'Arizona',
  'CA': 'California',
  'CO': 'Colorado',
  'CT': 'Connecticut',
  'DC': 'District of Columbia',
  'DE': 'Delaware',
  'FL': 'Florida',
  'GA': 'Georgia',
  'HI': 'Hawaii',
  'IA': 'Iowa',
  'ID': 'Idaho',
  'IL': 'Illinois',
  'IN': 'Indiana',
  'KS': 'Kansas',
  'KY': 'Kentucky',
  'LA': 'Louisiana',
  'MA': 'Massachusetts',
  'MD': 'Maryland',
  'ME': 'Maine',
  'MI': 'Michigan',
  'MN': 'Minnesota',
  'MO': 'Missouri',
  'MS': 'Mississippi',
  'MT': 'Montana',
  'NC': 'North Carolina',
  'ND': 'North Dakota',
  'NE': 'Nebraska',
  'NH': 'New Hampshire',
  'NJ': 'New Jersey',
  'NM': 'New Mexico',
  'NV': 'Nevada',
  'NY': 'New York',
  'OH': 'Ohio',
  'OK': 'Oklahoma',
  'OR': 'Oregon',
  'PA': 'Pennsylvania',
  'RI': 'Rhode Island',
  'SC': 'South Carolina',
  'SD': 'South Dakota',
  'TN': 'Tennessee',
  'TX': 'Texas',
  'UT': 'Utah',
  'VA': 'Virginia',
  'VT': 'Vermont',
  'WA': 'Washington',
  'WI': 'Wisconsin',
  'WV': 'West Virginia',
  'WY': 'Wyoming'
};

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
  { code: "WA", name: "Washington", taxType: "none", topRate: 0 }, // No regular income tax

  // Flat tax states
  { code: "AZ", name: "Arizona", taxType: "flat", topRate: 2.5 },
  { code: "CO", name: "Colorado", taxType: "flat", topRate: 4.4 },
  { code: "GA", name: "Georgia", taxType: "flat", topRate: 5.5 },
  { code: "ID", name: "Idaho", taxType: "flat", topRate: 5.8 },
  { code: "IL", name: "Illinois", taxType: "flat", topRate: 4.95 },
  { code: "IN", name: "Indiana", taxType: "flat", topRate: 3.15 },
  { code: "IA", name: "Iowa", taxType: "flat", topRate: 6.0 },
  { code: "KY", name: "Kentucky", taxType: "flat", topRate: 4.5 },
  { code: "LA", name: "Louisiana", taxType: "flat", topRate: 4.25 },
  { code: "MI", name: "Michigan", taxType: "flat", topRate: 4.25 },
  { code: "MS", name: "Mississippi", taxType: "flat", topRate: 5.0 },
  { code: "NC", name: "North Carolina", taxType: "flat", topRate: 4.75 },
  { code: "PA", name: "Pennsylvania", taxType: "flat", topRate: 3.07 },
  { code: "UT", name: "Utah", taxType: "flat", topRate: 4.85 },

  // Progressive tax states
  { code: "AL", name: "Alabama", taxType: "progressive", topRate: 5.0, brackets: 3 },
  { code: "AR", name: "Arkansas", taxType: "progressive", topRate: 4.7, brackets: 2 },
  { code: "CA", name: "California", taxType: "progressive", topRate: 9.3, brackets: 9 },
  { code: "CT", name: "Connecticut", taxType: "progressive", topRate: 6.99, brackets: 7 },
  { code: "DE", name: "Delaware", taxType: "progressive", topRate: 6.6, brackets: 6 },
  { code: "DC", name: "District of Columbia", taxType: "progressive", topRate: 10.75, brackets: 6 },
  { code: "HI", name: "Hawaii", taxType: "progressive", topRate: 11.0, brackets: 12 },
  { code: "KS", name: "Kansas", taxType: "progressive", topRate: 5.7, brackets: 2 },
  { code: "ME", name: "Maine", taxType: "progressive", topRate: 7.15, brackets: 3 },
  { code: "MD", name: "Maryland", taxType: "progressive", topRate: 5.75, brackets: 8 },
  { code: "MA", name: "Massachusetts", taxType: "progressive", topRate: 5.0, brackets: 2 },
  { code: "MN", name: "Minnesota", taxType: "progressive", topRate: 9.85, brackets: 4 },
  { code: "MO", name: "Missouri", taxType: "progressive", topRate: 4.8, brackets: 7 },
  { code: "MT", name: "Montana", taxType: "progressive", topRate: 5.9, brackets: 2 },
  { code: "NE", name: "Nebraska", taxType: "progressive", topRate: 6.64, brackets: 4 },
  { code: "NJ", name: "New Jersey", taxType: "progressive", topRate: 10.75, brackets: 7 },
  { code: "NM", name: "New Mexico", taxType: "progressive", topRate: 5.9, brackets: 6 },
  { code: "NY", name: "New York", taxType: "progressive", topRate: 10.9, brackets: 9 },
  { code: "ND", name: "North Dakota", taxType: "progressive", topRate: 2.9, brackets: 2 },
  { code: "OH", name: "Ohio", taxType: "progressive", topRate: 3.99, brackets: 2 },
  { code: "OK", name: "Oklahoma", taxType: "progressive", topRate: 4.75, brackets: 6 },
  { code: "OR", name: "Oregon", taxType: "progressive", topRate: 9.9, brackets: 4 },
  { code: "RI", name: "Rhode Island", taxType: "progressive", topRate: 5.99, brackets: 3 },
  { code: "SC", name: "South Carolina", taxType: "progressive", topRate: 6.4, brackets: 3 },
  { code: "VT", name: "Vermont", taxType: "progressive", topRate: 8.75, brackets: 4 },
  { code: "VA", name: "Virginia", taxType: "progressive", topRate: 5.75, brackets: 4 },
  { code: "WV", name: "West Virginia", taxType: "progressive", topRate: 5.5, brackets: 5 },
  { code: "WI", name: "Wisconsin", taxType: "progressive", topRate: 7.65, brackets: 4 },
];

/**
 * Get state info by 2-letter code
 */
export function getStateByCode(code: string): StateInfo | undefined {
  return US_STATES.find((s) => s.code === code.toUpperCase());
}

/**
 * Get state info by name
 */
export function getStateByName(name: string): StateInfo | undefined {
  return US_STATES.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get the simplified state tax rate (decimal)
 * Accepts either state code (e.g., "CA") or state name (e.g., "California")
 * Returns 0 for no-income-tax states
 */
export function getStateTaxRate(stateInput: string): number {
  // Check if it's a state name first (has spaces or more than 2 chars)
  if (stateInput.length > 2 || stateInput.includes(' ')) {
    return STATE_TAX_RATES[stateInput] ?? 0;
  }

  // Otherwise treat as code
  const stateName = STATE_CODE_TO_NAME[stateInput.toUpperCase()];
  if (stateName) {
    return STATE_TAX_RATES[stateName] ?? 0;
  }

  // Fallback to old method
  const state = getStateByCode(stateInput);
  return state ? state.topRate / 100 : 0;
}

/**
 * Get the default (top marginal) tax rate for a state
 * Returns 0 for no-income-tax states
 * @deprecated Use getStateTaxRate instead
 */
export function getDefaultStateTaxRate(code: string): number {
  const state = getStateByCode(code);
  return state?.topRate ?? 0;
}
