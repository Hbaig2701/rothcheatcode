"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

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
            <FieldLabel className="flex items-center gap-1.5">
              Conversion Type
              <FieldHelp {...FIELD_HELP.conversion_type} />
            </FieldLabel>
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
              <FieldLabel htmlFor="fixed_conversion_amount" className="flex items-center gap-1.5">
                Annual Conversion Amount
                <FieldHelp {...FIELD_HELP.fixed_conversion_amount} />
              </FieldLabel>
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
              <FieldLabel htmlFor="target_partial_amount" className="flex items-center gap-1.5">
                Total Amount to Convert
                <FieldHelp {...FIELD_HELP.target_partial_amount} />
              </FieldLabel>
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

      {/* Protect Initial Premium spans the full section grid row
          (sm:col-span-2 lg:col-span-3) so the description has room. We
          bypass Field here because its variants force [&>*]:w-full on direct
          children, which fights the flex-row [checkbox] [label] layout. */}
      <Controller
        name="protect_initial_premium"
        control={form.control}
        render={({ field }) => (
          <div className="sm:col-span-2 lg:col-span-3 flex flex-row items-start gap-3">
            <Checkbox
              id="protect_initial_premium"
              checked={field.value}
              onCheckedChange={field.onChange}
              className="mt-0.5 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <label
                htmlFor="protect_initial_premium"
                className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer"
              >
                Protect Initial Premium
                <FieldHelp {...FIELD_HELP.protect_initial_premium} />
              </label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Prevent withdrawals from reducing original premium.
              </p>
            </div>
          </div>
        )}
      />

      {/* Respect Contract Penalty-Free Limit lives under Tax Payment Source
          in Section 4 (tax-data.tsx). It only applies when tax is paid from
          the IRA, so it's grouped with the tax-source picker rather than
          the conversion-sizing controls. */}
    </FormSection>
  );
}
