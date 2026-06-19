"use client";

import type { Client } from "@/lib/types/client";

interface TaxFundingNoticeProps {
  client: Client;
  /**
   * Did the projection actually fund conversion tax from the IRA? Derived by the
   * report dashboard from `blueprint_years[].taxesPaidFromIRA`. This is the real
   * signal — it covers BOTH a $0 taxable account AND a positive-but-insufficient
   * one (the latter is corrected by the projection route's two-pass), where a
   * naive `taxable <= 0` client-side check would miss the partial case and leave
   * those advisors with a silently lower wealth number and no explanation.
   */
  taxFundedFromIra: boolean;
}

/**
 * Shown when the advisor chose "pay taxes from the taxable account" but the
 * account couldn't cover the conversion tax, so the engine funded it from the
 * IRA instead (you can't pay a tax bill from an account that's empty or too
 * small). Without this notice the change would be invisible; with it, the
 * advisor understands why the wealth number reflects the tax — and how to change
 * it. Renders nothing when it doesn't apply (taxable covered the tax, explicit
 * from-IRA, or no conversion).
 */
export function TaxFundingNotice({ client, taxFundedFromIra }: TaxFundingNoticeProps) {
  const choseFromTaxable = client.tax_payment_source !== "from_ira";

  if (!(choseFromTaxable && taxFundedFromIra)) return null;

  // The engine applies a 10% early-withdrawal penalty on IRA-funded conversion
  // tax while the client is under 59½ (age < 60 at conversion time). Surface it
  // when the conversions begin before 60, so advisors with working-age clients
  // know the penalty is included — and that it disappears if the tax is paid
  // from outside funds (e.g. salary) instead.
  const conversionStartAge = (client.age ?? 99) + (client.years_to_defer_conversion ?? 0);
  const underPenaltyAge = conversionStartAge < 60;

  return (
    <div className="mx-9 mt-6 rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
      <span className="font-semibold">Conversion taxes funded from the IRA.</span>{" "}
      This client is set to pay taxes from a taxable account, but it can&apos;t
      cover the conversion taxes — so the shortfall is being funded from the IRA
      (the realistic source). To change this, increase the client&apos;s taxable
      balance, or set Tax Payment Source to &ldquo;Internal (from IRA)&rdquo; to
      make it explicit.
      {underPenaltyAge && (
        <>
          {" "}
          <span className="font-semibold">
            Note: this client is under 59½
          </span>
          , so the IRA-funded conversion taxes include a 10% early-withdrawal
          penalty. If they&apos;ll pay the tax from outside funds (e.g. salary),
          enter a taxable balance to remove the penalty.
        </>
      )}
    </div>
  );
}
