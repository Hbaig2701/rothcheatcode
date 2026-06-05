"use client";

import { FormSection } from "@/components/clients/form-section";
import { WithdrawalsTable } from "@/components/clients/withdrawals-table";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

/**
 * Voluntary IRA / Roth distributions. IRA pulls satisfy the RMD up to their
 * amount (matches IRS rules); only the shortfall, if any, is forced as
 * additional RMD. Roth pulls are tax-free, and 'auto' rows let the baseline
 * naturally fall to IRA while the strategy uses the Roth bucket.
 */
export function RothWithdrawalsSection() {
  return (
    <FormSection
      title="8. IRA / Roth Withdrawals"
      description="Schedule voluntary distributions from the qualified buckets. IRA pulls count toward the RMD (no extra RMD is forced on top); only the shortfall, if any, is added as forced RMD."
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
