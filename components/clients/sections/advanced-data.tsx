"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import { Checkbox } from "@/components/ui/checkbox";

export function AdvancedDataSection() {
  const form = useFormContext<ClientFormData>();

  return (
    <FormSection title="8. Advanced Data" description="Additional projection parameters">
      {/* Surrender Years */}
      <Field data-invalid={!!form.formState.errors.surrender_years}>
        <FieldLabel htmlFor="surrender_years">Surrender Years</FieldLabel>
        <Input
          id="surrender_years"
          type="number"
          min={0}
          max={20}
          {...form.register("surrender_years", { valueAsNumber: true })}
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
            <FieldLabel htmlFor="penalty_free_percent">Penalty Free %</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Annual penalty-free withdrawal percentage</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Baseline Comparison Rate */}
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

      {/* Post Contract Rate */}
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

      {/* Years to Defer Conversion */}
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

      {/* End Age */}
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

      {/* Heir Tax Rate */}
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

      {/* Show Widow's Penalty */}
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
    </FormSection>
  );
}
