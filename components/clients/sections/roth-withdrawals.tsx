"use client";

import { FormSection } from "@/components/clients/form-section";
import { WithdrawalsTable } from "@/components/clients/withdrawals-table";

/**
 * Voluntary IRA / Roth withdrawals on top of RMDs and conversions.
 * The schedule is engine-aware: IRA pulls add to taxable income (with 10%
 * penalty under 59½), Roth pulls are tax-free, and 'auto' rows let the
 * baseline naturally fall to IRA while the strategy uses the Roth bucket.
 */
export function RothWithdrawalsSection() {
  return (
    <FormSection
      title="6. IRA / Roth Withdrawals"
      description="Schedule voluntary withdrawals from the qualified buckets, in addition to RMDs and any Roth conversions."
    >
      <div className="sm:col-span-2 lg:col-span-3">
        <WithdrawalsTable />
      </div>
    </FormSection>
  );
}
