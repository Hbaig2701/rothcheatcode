"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFullFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const STRATEGY_OPTIONS = [
  { value: "conservative", label: "Conservative - Stay in lowest bracket" },
  { value: "moderate", label: "Moderate - Fill 22%/24% bracket" },
  { value: "aggressive", label: "Aggressive - Fill 32% bracket" },
  { value: "irmaa_safe", label: "IRMAA-Safe - Avoid Medicare surcharges" },
] as const;

const TAX_SOURCE_OPTIONS = [
  { value: "from_taxable", label: "Pay from taxable accounts" },
  { value: "from_ira", label: "Pay from IRA (reduces conversion amount)" },
] as const;

export function ConversionSection() {
  const form = useFormContext<ClientFullFormData>();

  return (
    <FormSection title="Conversion Settings">
      {/* Strategy */}
      <Controller
        name="strategy"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Conversion Strategy</FieldLabel>
            <div className="space-y-2">
              {STRATEGY_OPTIONS.map((option) => (
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
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Start Age */}
      <Field data-invalid={!!form.formState.errors.start_age}>
        <FieldLabel htmlFor="start_age">Start Age</FieldLabel>
        <Input
          id="start_age"
          type="number"
          min={50}
          max={90}
          {...form.register("start_age", { valueAsNumber: true })}
        />
        <FieldDescription>Age to begin Roth conversions</FieldDescription>
        <FieldError errors={[form.formState.errors.start_age]} />
      </Field>

      {/* End Age */}
      <Field data-invalid={!!form.formState.errors.end_age}>
        <FieldLabel htmlFor="end_age">End Age</FieldLabel>
        <Input
          id="end_age"
          type="number"
          min={55}
          max={95}
          {...form.register("end_age", { valueAsNumber: true })}
        />
        <FieldDescription>When to stop conversions</FieldDescription>
        <FieldError errors={[form.formState.errors.end_age]} />
      </Field>

      {/* Tax Payment Source */}
      <Controller
        name="tax_payment_source"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Tax Payment Source</FieldLabel>
            <div className="space-y-2">
              {TAX_SOURCE_OPTIONS.map((option) => (
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
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  );
}
