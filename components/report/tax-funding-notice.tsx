"use client";

import type { Client } from "@/lib/types/client";

interface TaxFundingNoticeProps {
  client: Client;
}

/**
 * Shown when the advisor chose "pay taxes from the taxable account" but the
 * client has NO taxable account ($0) to draw from. In that case the conversion
 * tax has no external funding source, so the engine funds it from the IRA
 * instead (you can't pay a tax bill from a $0 account). Without this notice the
 * change would be invisible; with it, the advisor understands why the wealth
 * number reflects the tax — and how to change it. Renders nothing when it
 * doesn't apply (real taxable balance, explicit from-IRA, or no conversion).
 */
export function TaxFundingNotice({ client }: TaxFundingNoticeProps) {
  const choseFromTaxable = client.tax_payment_source !== "from_ira";
  const noTaxableAccount = (client.taxable_accounts ?? 0) <= 0;
  const doesConvert = (client.conversion_type ?? "optimized_amount") !== "no_conversion";

  if (!(choseFromTaxable && noTaxableAccount && doesConvert)) return null;

  // The engine applies a 10% early-withdrawal penalty on IRA-funded conversion
  // tax while the client is under 59½ (age < 60 at conversion time). Surface it
  // when the conversions begin before 60, so advisors with working-age clients
  // know the penalty is included — and that it disappears if the tax is paid
  // from outside funds (e.g. salary) instead.
  const conversionStartAge = (client.age ?? 99) + (client.years_to_defer_conversion ?? 0);
  const underPenaltyAge = conversionStartAge < 60;

  return (
    <div className="mx-9 mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <span className="font-semibold">Conversion taxes funded from the IRA.</span>{" "}
      This client is set to pay taxes from a taxable account, but no taxable
      balance is entered — so the conversion taxes are being funded from the IRA
      (the realistic source when there&apos;s no outside account). To change
      this, enter the client&apos;s taxable balance, or set Tax Payment Source to
      &ldquo;Internal (from IRA)&rdquo; to make it explicit.
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
