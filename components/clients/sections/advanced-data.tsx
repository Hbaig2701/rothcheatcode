"use client";

import { useState, useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import { Checkbox } from "@/components/ui/checkbox";
import { isFieldLocked, isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import { Lock, LockOpen, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdvancedDataSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  // Per-field overrides for preset-locked values. An advisor can click "Edit"
  // next to a locked field to take manual control (e.g., the same product
  // ships with different surrender years state-to-state). When overridden,
  // the preset value persists as-is in the form — advisors own the change.
  const [overrideSurrender, setOverrideSurrender] = useState(false);
  const [overridePenaltyFree, setOverridePenaltyFree] = useState(false);
  const form = useFormContext<ClientFormData>();
  const formulaType = form.watch("blueprint_type") as FormulaType;
  const rateOfReturn = form.watch("rate_of_return");
  const isGI = isGuaranteedIncomeProduct(formulaType);

  // Auto-sync baseline_comparison_rate with rate_of_return for ALL products
  // For a fair comparison, both scenarios should use the same growth rate
  useEffect(() => {
    form.setValue("baseline_comparison_rate", rateOfReturn);
  }, [rateOfReturn, form]);

  // Reset overrides when the product preset changes — the new product's
  // defaults should apply fresh, not inherit the previous override state.
  useEffect(() => {
    setOverrideSurrender(false);
    setOverridePenaltyFree(false);
  }, [formulaType]);

  const isSurrenderLocked = isFieldLocked("surrenderYears", formulaType) && !overrideSurrender;
  const isPenaltyFreeLocked = isFieldLocked("penaltyFreePercent", formulaType) && !overridePenaltyFree;
  const surrenderCanOverride = isFieldLocked("surrenderYears", formulaType);
  const penaltyFreeCanOverride = isFieldLocked("penaltyFreePercent", formulaType);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {isExpanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">
          8. Advanced Data
        </h3>
        <span className="text-xs text-muted-foreground">
          {isExpanded ? "Click to collapse" : "Click to expand"}
        </span>
      </button>

      {isExpanded && (
        <div className="grid gap-4 pl-6">
          {/* Surrender Years */}
          <Field data-invalid={!!form.formState.errors.surrender_years}>
            <FieldLabel htmlFor="surrender_years" className="flex items-center gap-1.5">
              Surrender Years
              {isSurrenderLocked && <Lock className="size-3 text-muted-foreground" />}
              {overrideSurrender && surrenderCanOverride && (
                <LockOpen className="size-3 text-amber-600 dark:text-amber-400" />
              )}
              {surrenderCanOverride && (
                <button
                  type="button"
                  onClick={() => setOverrideSurrender((v) => !v)}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  {overrideSurrender ? "Re-lock" : "Override preset"}
                </button>
              )}
            </FieldLabel>
            <Input
              id="surrender_years"
              type="number"
              min={0}
              max={20}
              {...form.register("surrender_years", { valueAsNumber: true })}
              disabled={isSurrenderLocked}
              className={cn(isSurrenderLocked && "opacity-60 cursor-not-allowed bg-muted/30")}
            />
            <FieldDescription>
              {overrideSurrender && surrenderCanOverride
                ? "Overriding preset — value does not match the selected product's typical terms."
                : "Years with surrender charges (0-20)"}
            </FieldDescription>
            <FieldError errors={[form.formState.errors.surrender_years]} />
          </Field>

          {/* Penalty Free % */}
          <Controller
            name="penalty_free_percent"
            control={form.control}
            render={({ field: { ref, ...field }, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="penalty_free_percent" className="flex items-center gap-1.5">
                  Penalty Free %
                  {isPenaltyFreeLocked && <Lock className="size-3 text-muted-foreground" />}
                  {overridePenaltyFree && penaltyFreeCanOverride && (
                    <LockOpen className="size-3 text-amber-600 dark:text-amber-400" />
                  )}
                  {penaltyFreeCanOverride && (
                    <button
                      type="button"
                      onClick={() => setOverridePenaltyFree((v) => !v)}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      {overridePenaltyFree ? "Re-lock" : "Override preset"}
                    </button>
                  )}
                </FieldLabel>
                <PercentInput
                  {...field}
                  aria-invalid={fieldState.invalid}
                  disabled={isPenaltyFreeLocked}
                  className={cn(isPenaltyFreeLocked && "opacity-60 cursor-not-allowed bg-muted/30")}
                />
                <FieldDescription>
                  {overridePenaltyFree && penaltyFreeCanOverride
                    ? "Overriding preset — value does not match the selected product's typical terms."
                    : "Annual penalty-free withdrawal percentage"}
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* Baseline Comparison Rate - Hidden for GI (auto-synced with Rate of Return) */}
          {!isGI && (
            <Controller
              name="baseline_comparison_rate"
              control={form.control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="baseline_comparison_rate">Baseline Comparison Rate</FieldLabel>
                  <PercentInput
                    {...field}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Return rate for baseline scenario comparison</FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}

          {/* Post Contract Rate - Growth products only */}
          {!isGI && (
            <Controller
              name="post_contract_rate"
              control={form.control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="post_contract_rate">Post Contract Rate</FieldLabel>
                  <PercentInput
                    {...field}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Annuity renewal rate applied after the surrender period ends.
                    Only affects the strategy projection (the annuity&apos;s account value) —
                    the baseline &quot;do nothing&quot; IRA continues to grow at its own rate.
                    Defaults to the main Rate of Return if left blank.
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}

          {/* Years to Defer Conversion - Growth products only (GI uses gi_conversion_years) */}
          {!isGI && (
            <Field data-invalid={!!form.formState.errors.years_to_defer_conversion}>
              <FieldLabel htmlFor="years_to_defer_conversion">Years to Defer Conversion</FieldLabel>
              <Input
                id="years_to_defer_conversion"
                type="number"
                min={0}
                max={30}
                {...form.register("years_to_defer_conversion", { valueAsNumber: true })}
              />
              <FieldDescription>Delay conversions by this many years</FieldDescription>
              <FieldError errors={[form.formState.errors.years_to_defer_conversion]} />
            </Field>
          )}

          {/* End Age - Always editable */}
          <Field data-invalid={!!form.formState.errors.end_age}>
            <FieldLabel htmlFor="end_age">End Age</FieldLabel>
            <Input
              id="end_age"
              type="number"
              min={55}
              max={120}
              {...form.register("end_age", { valueAsNumber: true })}
            />
            <FieldDescription>Age to project until (55-120)</FieldDescription>
            <FieldError errors={[form.formState.errors.end_age]} />
          </Field>

          {/* Heir Tax Rate - Always editable */}
          <Controller
            name="heir_tax_rate"
            control={form.control}
            render={({ field: { ref, ...field }, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="heir_tax_rate">Heir Tax Rate</FieldLabel>
                <PercentInput
                  {...field}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>Expected tax rate for heirs on inherited IRA</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* Show Widow's Penalty - Always editable */}
          <Controller
            name="widow_analysis"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="widow_analysis"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <FieldLabel htmlFor="widow_analysis">
                  Show Widow&apos;s Penalty
                </FieldLabel>
                <FieldDescription>Include analysis of single-filer tax impact</FieldDescription>
              </Field>
            )}
          />
        </div>
      )}
    </div>
  );
}
