"use client";

import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFullFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PercentInput } from "@/components/ui/percent-input";
import { Checkbox } from "@/components/ui/checkbox";
import { FEDERAL_BRACKETS } from "@/lib/data/federal-brackets";
import { getDefaultStateTaxRate } from "@/lib/data/states";

export function TaxConfigSection() {
  const form = useFormContext<ClientFullFormData>();
  const state = form.watch("state");

  // Auto-update state tax rate when state changes
  useEffect(() => {
    if (state && state.length === 2) {
      const defaultRate = getDefaultStateTaxRate(state);
      form.setValue("state_tax_rate", defaultRate);
    }
  }, [state, form]);

  return (
    <FormSection title="Tax Configuration">
      {/* Federal Bracket */}
      <Controller
        name="federal_bracket"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="federal_bracket">Federal Bracket</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="federal_bracket"
                className="w-full"
                aria-invalid={fieldState.invalid}
              >
                <SelectValue placeholder="Select bracket" />
              </SelectTrigger>
              <SelectContent>
                {FEDERAL_BRACKETS.map((bracket) => (
                  <SelectItem key={bracket.value} value={bracket.value}>
                    {bracket.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* State Tax Rate */}
      <Controller
        name="state_tax_rate"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="state_tax_rate">State Tax Rate</FieldLabel>
            <PercentInput
              {...field}
              value={field.value ?? undefined}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Auto-filled from state selection</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Include NIIT */}
      <Controller
        name="include_niit"
        control={form.control}
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id="include_niit"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <FieldLabel htmlFor="include_niit">
              Include NIIT (3.8% surtax)
            </FieldLabel>
          </Field>
        )}
      />

      {/* Include ACA */}
      <Controller
        name="include_aca"
        control={form.control}
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id="include_aca"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <FieldLabel htmlFor="include_aca">Include ACA Subsidy</FieldLabel>
            <FieldDescription>For pre-Medicare clients</FieldDescription>
          </Field>
        )}
      />
    </FormSection>
  );
}
