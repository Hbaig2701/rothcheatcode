"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";

export function NewAccountSection() {
  const form = useFormContext<ClientFormData>();

  return (
    <FormSection title="3. New Account Data" description="Insurance product details">
      {/* Carrier Name */}
      <Field data-invalid={!!form.formState.errors.carrier_name}>
        <FieldLabel htmlFor="carrier_name">Carrier Name</FieldLabel>
        <Input
          id="carrier_name"
          {...form.register("carrier_name")}
          aria-invalid={!!form.formState.errors.carrier_name}
        />
        <FieldError errors={[form.formState.errors.carrier_name]} />
      </Field>

      {/* Product Name */}
      <Field data-invalid={!!form.formState.errors.product_name}>
        <FieldLabel htmlFor="product_name">Product Name</FieldLabel>
        <Input
          id="product_name"
          {...form.register("product_name")}
          aria-invalid={!!form.formState.errors.product_name}
        />
        <FieldError errors={[form.formState.errors.product_name]} />
      </Field>

      {/* Bonus % */}
      <Controller
        name="bonus_percent"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="bonus_percent">Bonus %</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Premium bonus percentage (e.g., 10%)</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Rate of Return */}
      <Controller
        name="rate_of_return"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="rate_of_return">Rate of Return %</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Expected annual return rate</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  );
}
