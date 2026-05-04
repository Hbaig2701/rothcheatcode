"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";

const CONVERSION_TYPE_OPTIONS = [
  { value: "optimized_amount", label: "Optimized Amount", help: "Each year, fill up to the target tax bracket. Continues until the IRA is empty or the projection ends." },
  { value: "partial_amount", label: "Partial Amount", help: "Convert optimally each year, but stop once cumulative conversions reach a target total dollar amount." },
  { value: "fixed_amount", label: "Fixed Amount", help: "Convert the same dollar amount every year (or remaining balance if less)." },
  { value: "full_conversion", label: "Full Conversion", help: "Convert everything aggressively in the first year possible." },
  { value: "no_conversion", label: "No Conversion", help: "Don't convert anything (baseline behavior)." },
] as const;

export function ConversionSection() {
  const form = useFormContext<ClientFormData>();
  const formulaType = form.watch("blueprint_type") as FormulaType;
  const conversionType = form.watch("conversion_type");

  // Hide for GI products - they use gi_conversion_years and gi_conversion_bracket instead
  if (isGuaranteedIncomeProduct(formulaType)) {
    return null;
  }

  return (
    <FormSection title="6. Conversion">
      {/* Conversion Type */}
      <Controller
        name="conversion_type"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Conversion Type</FieldLabel>
            <div className="space-y-2">
              {CONVERSION_TYPE_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={option.value}
                    checked={field.value === option.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-4 w-4 text-primary mt-0.5 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="text-sm">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.help}</div>
                  </div>
                </label>
              ))}
            </div>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Fixed Conversion Amount - only show when "Fixed Amount" is selected */}
      {conversionType === "fixed_amount" && (
        <Controller
          name="fixed_conversion_amount"
          control={form.control}
          render={({ field: { ref, value, onChange, ...field }, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="fixed_conversion_amount">Annual Conversion Amount</FieldLabel>
              <CurrencyInput
                {...field}
                value={value ?? 0}
                onChange={onChange}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>Fixed dollar amount to convert each year</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      {/* Target Partial Amount - only show when "Partial Amount" is selected */}
      {conversionType === "partial_amount" && (
        <Controller
          name="target_partial_amount"
          control={form.control}
          render={({ field: { ref, value, onChange, ...field }, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="target_partial_amount">Total Amount to Convert</FieldLabel>
              <CurrencyInput
                {...field}
                value={value ?? 0}
                onChange={onChange}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Cumulative target across all years. The engine converts optimally each year (filling the tax bracket) and stops once total conversions reach this amount.
                For example: client has $3.1M in their IRA but only wants to convert $2.2M total — the remaining $900K stays as Traditional.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      {/* Protect Initial Premium */}
      <Controller
        name="protect_initial_premium"
        control={form.control}
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id="protect_initial_premium"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <FieldLabel htmlFor="protect_initial_premium">
              Protect Initial Premium
            </FieldLabel>
            <FieldDescription>Prevent withdrawals from reducing original premium</FieldDescription>
          </Field>
        )}
      />
    </FormSection>
  );
}
