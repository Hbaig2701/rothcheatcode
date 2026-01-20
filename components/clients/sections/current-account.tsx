"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";

export function CurrentAccountSection() {
  const form = useFormContext<ClientFormData>();

  return (
    <FormSection title="2. Current Account Data">
      {/* Qualified Account Value */}
      <Controller
        name="qualified_account_value"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="qualified_account_value">Qualified Account Value</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Total value of Traditional IRA, 401(k), and other qualified accounts</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  );
}
