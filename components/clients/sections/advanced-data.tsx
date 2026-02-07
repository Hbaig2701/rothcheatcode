"use client";

import { useState, useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { isFieldLocked, isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import { Lock, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdvancedDataSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const form = useFormContext<ClientFormData>();
  const formulaType = form.watch("blueprint_type") as FormulaType;
  const rateOfReturn = form.watch("rate_of_return");
  const isGI = isGuaranteedIncomeProduct(formulaType);

  // Auto-sync baseline_comparison_rate with rate_of_return for ALL products
  // For a fair comparison, both scenarios should use the same growth rate
  useEffect(() => {
    form.setValue("baseline_comparison_rate", rateOfReturn);
  }, [rateOfReturn, form]);

  const isSurrenderLocked = isFieldLocked("surrenderYears", formulaType);
  const isPenaltyFreeLocked = isFieldLocked("penaltyFreePercent", formulaType);

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
            <FieldDescription>Years with surrender charges (0-20)</FieldDescription>
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
                </FieldLabel>
                <PercentInput
                  {...field}
                  aria-invalid={fieldState.invalid}
                  disabled={isPenaltyFreeLocked}
                  className={cn(isPenaltyFreeLocked && "opacity-60 cursor-not-allowed bg-muted/30")}
                />
                <FieldDescription>Annual penalty-free withdrawal percentage</FieldDescription>
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

          {/* Post Contract Rate - Always editable */}
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
                <FieldDescription>Return rate after contract period ends</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* Years to Defer Conversion - Always editable */}
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

          {/* RMD Treatment - How RMDs are handled in baseline */}
          <Controller
            name="rmd_treatment"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="rmd_treatment">RMD Treatment (Baseline)</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select RMD treatment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spent">Spent on Living Expenses</SelectItem>
                    <SelectItem value="reinvested">Reinvested (Taxable Brokerage)</SelectItem>
                    <SelectItem value="cash">Sits in Cash (No Growth)</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>How RMDs are treated in the baseline scenario</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

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
