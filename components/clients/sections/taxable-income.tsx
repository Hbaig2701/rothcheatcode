"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { IncomeTable } from "@/components/clients/income-table";

export function TaxableIncomeSection() {
  const form = useFormContext<ClientFormData>();

  return (
    <FormSection title="5. Taxable Income Calculation">
      {/* SSI Payout Age */}
      <Field data-invalid={!!form.formState.errors.ssi_payout_age}>
        <FieldLabel htmlFor="ssi_payout_age">SSI Payout Age</FieldLabel>
        <Input
          id="ssi_payout_age"
          type="number"
          min={62}
          max={70}
          {...form.register("ssi_payout_age", { valueAsNumber: true })}
          aria-invalid={!!form.formState.errors.ssi_payout_age}
        />
        <FieldDescription>Age to begin Social Security (62-70)</FieldDescription>
        <FieldError errors={[form.formState.errors.ssi_payout_age]} />
      </Field>

      {/* SSI Annual Amount */}
      <Controller
        name="ssi_annual_amount"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="ssi_annual_amount">SSI Annual Amount</FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Combined Social Security annual benefits</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Non-SSI Income Table */}
      <div className="col-span-full">
        <IncomeTable />
      </div>
    </FormSection>
  );
}
