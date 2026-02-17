"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";

const CONVERSION_TYPE_OPTIONS = [
  { value: "optimized_amount", label: "Optimized Amount" },
  { value: "fixed_amount", label: "Fixed Amount" },
  { value: "full_conversion", label: "Full Conversion" },
  { value: "no_conversion", label: "No Conversion" },
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
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={option.value}
                    checked={field.value === option.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-4 w-4 text-primary"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
            <FieldDescription>How to determine conversion amounts</FieldDescription>
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
