import type { Client } from '@/lib/types/client';

/**
 * Create SHA-256 hash of client input for cache deduplication
 * Uses sorted keys to ensure consistent hashing regardless of object order
 */
export async function hashClientInput(client: Client): Promise<string> {
  // Extract only calculation-relevant fields (exclude metadata)
  const relevantFields = {
    date_of_birth: client.date_of_birth,
    spouse_dob: client.spouse_dob,
    filing_status: client.filing_status,
    state: client.state,
    life_expectancy: client.life_expectancy,
    traditional_ira: client.traditional_ira,
    roth_ira: client.roth_ira,
    taxable_accounts: client.taxable_accounts,
    other_retirement: client.other_retirement,
    federal_bracket: client.federal_bracket,
    state_tax_rate: client.state_tax_rate,
    include_niit: client.include_niit,
    include_aca: client.include_aca,
    ss_self: client.ss_self,
    ss_spouse: client.ss_spouse,
    pension: client.pension,
    other_income: client.other_income,
    ss_start_age: client.ss_start_age,
    strategy: client.strategy,
    start_age: client.start_age,
    end_age: client.end_age,
    tax_payment_source: client.tax_payment_source,
    growth_rate: client.growth_rate,
    inflation_rate: client.inflation_rate,
    heir_bracket: client.heir_bracket,
    projection_years: client.projection_years,
  };

  // Sort keys for consistent ordering
  const sortedJson = JSON.stringify(relevantFields, Object.keys(relevantFields).sort());

  // Use Web Crypto API (works in browser and Edge runtime)
  const encoder = new TextEncoder();
  const data = encoder.encode(sortedJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
