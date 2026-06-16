"use client";

import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

/**
 * Section 7: AUM Allocation (optional)
 *
 * Lets the advisor model the typical pitch: "Convert X% of the IRA via Roth,
 * send the remaining Y% to a managed brokerage account (AUM)." When the
 * toggle is OFF (allocation_percent = 0) the form behaves exactly as before.
 *
 * The advanced fields (fee, dividend yield, turnover, withdrawal years, LTCG
 * rate) live behind a "Show advanced" toggle so the common case stays
 * one-input-per-decision.
 */
export function AumAllocationSection() {
  const form = useFormContext<ClientFormData>();
  const allocationPct = form.watch("aum_allocation_percent") ?? 0;
  const isOn = allocationPct > 0;
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <FormSection title="7. AUM Allocation (Optional)">
      {/* Master toggle — sets allocation to 50% on enable, 0 on disable. */}
      <div className="sm:col-span-2 lg:col-span-3 flex flex-row items-start gap-3">
        <Checkbox
          id="aum_allocation_enabled"
          checked={isOn}
          onCheckedChange={(checked) => {
            form.setValue("aum_allocation_percent", checked ? 50 : 0, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          className="mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <label
            htmlFor="aum_allocation_enabled"
            className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer"
          >
            Send part of the IRA to a managed brokerage account (AUM)
            <FieldHelp {...FIELD_HELP.aum_allocation_enabled} />
          </label>
          <p className="text-sm text-muted-foreground mt-0.5">
            The Roth conversion runs on the remainder. Combined view shows the full strategy.
          </p>
        </div>
      </div>

      {isOn && (
        <>
          {/* Allocation % — % of IRA that goes to AUM */}
          <Controller
            name="aum_allocation_percent"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="aum_allocation_percent" className="flex items-center gap-1.5">
                  % to AUM
                  <FieldHelp {...FIELD_HELP.aum_allocation_percent} />
                </FieldLabel>
                <Input
                  id="aum_allocation_percent"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={field.value ?? 0}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  // Select on focus so typing replaces the value instead of
                  // fighting the existing number (it can't be blanked — the
                  // field coerces empty to 0 — so replace-on-type is the fix).
                  onFocus={(e) => e.currentTarget.select()}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  Roth conversion runs on the other {Math.max(0, 100 - (field.value ?? 0))}%.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* Withdrawal years — how to spread the IRA-to-AUM transfer */}
          <Controller
            name="aum_withdrawal_years"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="aum_withdrawal_years" className="flex items-center gap-1.5">
                  Withdrawal years
                  <FieldHelp {...FIELD_HELP.aum_withdrawal_years} />
                </FieldLabel>
                <Input
                  id="aum_withdrawal_years"
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={field.value ?? 5}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  How many years to spread the IRA-to-AUM transfer over (manages the bracket spike).
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* AUM fee — visible by default since most advisors will want to set it */}
          <Controller
            name="aum_fee_percent"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="aum_fee_percent" className="flex items-center gap-1.5">
                  AUM fee (%/yr)
                  <FieldHelp {...FIELD_HELP.aum_fee_percent} />
                </FieldLabel>
                <Input
                  id="aum_fee_percent"
                  type="number"
                  min={0}
                  max={10}
                  step={0.05}
                  value={field.value ?? 1}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>Annual advisory fee on the AUM balance.</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide advanced AUM tax assumptions" : "Show advanced AUM tax assumptions"}
            </button>
          </div>

          {showAdvanced && (
            <>
              <Controller
                name="aum_dividend_yield"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="aum_dividend_yield" className="flex items-center gap-1.5">
                      Dividend yield (%/yr)
                      <FieldHelp {...FIELD_HELP.aum_dividend_yield} />
                    </FieldLabel>
                    <Input
                      id="aum_dividend_yield"
                      type="number"
                      min={0}
                      max={20}
                      step={0.1}
                      value={field.value ?? 2}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>Taxed annually at the LTCG rate.</FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="aum_turnover_percent"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="aum_turnover_percent" className="flex items-center gap-1.5">
                      Annual turnover (%)
                      <FieldHelp {...FIELD_HELP.aum_turnover_percent} />
                    </FieldLabel>
                    <Input
                      id="aum_turnover_percent"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={field.value ?? 10}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Share of unrealized gains realized each year (turnover drag).
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="ltcg_rate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="ltcg_rate" className="flex items-center gap-1.5">
                      LTCG rate (%)
                      <FieldHelp {...FIELD_HELP.ltcg_rate} />
                    </FieldLabel>
                    <Input
                      id="ltcg_rate"
                      type="number"
                      min={0}
                      max={50}
                      step={1}
                      value={field.value ?? 15}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Long-term cap-gains rate applied to dividend + turnover drag.
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </>
          )}
        </>
      )}
    </FormSection>
  );
}
