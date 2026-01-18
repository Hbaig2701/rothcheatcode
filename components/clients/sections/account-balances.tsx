"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFullFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";

export function AccountBalancesSection() {
  const form = useFormContext<ClientFullFormData>();

  return (
    <FormSection
      title="Account Balances"
      description="Current balances in today's dollars"
    >
      {/* Traditional IRA */}
      <Controller
        name="traditional_ira"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="traditional_ira">Traditional IRA</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Pre-tax retirement accounts</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Roth IRA */}
      <Controller
        name="roth_ira"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="roth_ira">Roth IRA</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Tax-free retirement accounts</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Taxable Accounts */}
      <Controller
        name="taxable_accounts"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="taxable_accounts">Taxable Accounts</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Brokerage, savings</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Other Retirement */}
      <Controller
        name="other_retirement"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="other_retirement">Other Retirement</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>401k, 403b, etc.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  );
}
