"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFullFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";

export function IncomeSourcesSection() {
  const form = useFormContext<ClientFullFormData>();

  return (
    <FormSection title="Income Sources" description="Annual amounts in today's dollars">
      {/* Social Security (Self) */}
      <Controller
        name="ss_self"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="ss_self">Social Security (Self)</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Your annual SS benefit</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Social Security (Spouse) */}
      <Controller
        name="ss_spouse"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="ss_spouse">Social Security (Spouse)</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Spouse&apos;s annual SS benefit</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Pension */}
      <Controller
        name="pension"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="pension">Pension</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Annual pension income</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Other Income */}
      <Controller
        name="other_income"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="other_income">Other Income</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Rental, part-time work, etc.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* SS Start Age */}
      <Field data-invalid={!!form.formState.errors.ss_start_age}>
        <FieldLabel htmlFor="ss_start_age">SS Start Age</FieldLabel>
        <Input
          id="ss_start_age"
          type="number"
          min={62}
          max={70}
          {...form.register("ss_start_age", { valueAsNumber: true })}
        />
        <FieldDescription>Age to begin Social Security benefits (62-70)</FieldDescription>
        <FieldError errors={[form.formState.errors.ss_start_age]} />
      </Field>
    </FormSection>
  );
}
