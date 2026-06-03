"use client";

import { FormSection } from "@/components/clients/form-section";
import { WithdrawalsTable } from "@/components/clients/withdrawals-table";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

/**
 * Voluntary IRA / Roth withdrawals on top of RMDs and conversions.
 * The schedule is engine-aware: IRA pulls add to taxable income (with 10%
 * penalty under 59½), Roth pulls are tax-free, and 'auto' rows let the
 * baseline naturally fall to IRA while the strategy uses the Roth bucket.
 */
export function RothWithdrawalsSection() {
  return (
    <FormSection
      title="8. IRA / Roth Withdrawals"
      description="Schedule voluntary withdrawals from the qualified buckets, in addition to RMDs and any Roth conversions."
    >
      <div className="sm:col-span-2 lg:col-span-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FieldHelp {...FIELD_HELP.withdrawals_table} />
          <span>What goes here?</span>
        </div>
        <WithdrawalsTable />
      </div>
    </FormSection>
  );
}
