import { createSimulationInput } from "@/lib/calculations/engine";
import type { SimulationResult } from "@/lib/calculations/types";
import type { Client } from "@/lib/types/client";
import type { CustomProductRow } from "@/lib/products/types";

/**
 * Conversion-tax funding fallback for the PARTIAL-taxable case.
 *
 * The engines already fund conversion tax from the IRA when the taxable account
 * is exactly $0. But when the account is POSITIVE yet smaller than the
 * conversion tax, a 'from_taxable' client drains it and the engine silently
 * clamps the excess to $0 — making conversions look tax-free and inflating
 * wealth (the "$0 → $1 cliff": a client with a tiny taxable balance jumps back
 * to the inflated number). A per-year clamp-site patch can't fix this because
 * the conversion SIZE must also shrink (the optimizer grosses the conversion
 * down only when paying from the IRA), so we re-run the STRATEGY funding from
 * the IRA — reusing the fully-tested gross-down path — and keep the original
 * baseline (do-nothing, no conversions) so the comparison stays fair.
 *
 * No-op when the engine already handles it (from_ira / $0 taxable), when the
 * taxable account covers the conversion tax, or when there's no conversion.
 */
export function fundConvTaxFromIraIfShort<T extends SimulationResult>(
  client: Client,
  rothSideClient: Client,
  customProduct: CustomProductRow | null,
  run: (input: ReturnType<typeof createSimulationInput>) => T,
  firstPass: T,
): T {
  if (client.tax_payment_source === 'from_ira') return firstPass;
  const taxable = client.taxable_accounts ?? 0;
  const conversionTax = (r: T) => r.formula.reduce(
    (sum, y) => sum + (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0),
    0,
  );

  // $0 taxable: the engine already funded the strategy from the IRA, so
  // firstPass's conversion tax is the IRA-funded plan's. The amount to show
  // the advisor is the OUTSIDE-funded plan's tax, which needs its own run —
  // any positive balance takes the external path, and the balance itself
  // doesn't change conversion sizing. Only runs when the notice will show.
  if (taxable <= 0) {
    if (!firstPass.formula.some((y) => (y.taxesPaidFromIRA ?? 0) > 0)) return firstPass;
    const externalRun = run(createSimulationInput({ ...rothSideClient, taxable_accounts: 1 }, customProduct));
    stampTaxableNeeded(firstPass, conversionTax(externalRun));
    return firstPass;
  }

  const convTax = conversionTax(firstPass);
  if (convTax <= 0 || taxable >= convTax) return firstPass;
  const reRun = run(
    createSimulationInput({ ...rothSideClient, tax_payment_source: 'from_ira' }, customProduct),
  );
  const result = { ...reRun, baseline: firstPass.baseline };
  stampTaxableNeeded(result, convTax);
  return result;
}

function stampTaxableNeeded(result: SimulationResult, amount: number) {
  if (amount > 0 && result.formula[0]) result.formula[0].taxableBalanceNeeded = amount;
}

