"use client";

import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
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
import { US_STATES, getDefaultStateTaxRate } from "@/lib/data/states";

const CONSTRAINT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "bracket_ceiling", label: "Bracket Ceiling" },
  { value: "irmaa_threshold", label: "IRMAA Threshold" },
  { value: "fixed_amount", label: "Fixed Amount" },
] as const;

const TAX_SOURCE_OPTIONS = [
  { value: "from_taxable", label: "External (from taxable accounts)" },
  { value: "from_ira", label: "Internal (from IRA)" },
] as const;

export function TaxDataSection() {
  const form = useFormContext<ClientFormData>();
  const state = form.watch("state");

  // Auto-update state tax rate when state changes
  useEffect(() => {
    if (state && state.length === 2) {
      const defaultRate = getDefaultStateTaxRate(state);
      form.setValue("state_tax_rate", defaultRate);
    }
  }, [state, form]);

  return (
    <FormSection title="4. Tax Data">
      {/* Constraint */}
      <Controller
        name="constraint_type"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="constraint_type">Constraint</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="constraint_type"
                className="w-full"
                aria-invalid={fieldState.invalid}
              >
                <SelectValue placeholder="Select constraint" />
              </SelectTrigger>
              <SelectContent>
                {CONSTRAINT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Optimization constraint for conversions</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Tax Rate */}
      <Controller
        name="tax_rate"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="tax_rate">Tax Rate</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Current federal tax rate</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Max Tax Rate */}
      <Controller
        name="max_tax_rate"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="max_tax_rate">Max Tax Rate</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Maximum tax rate ceiling for conversions</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

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

      {/* State */}
      <Controller
        name="state"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="state">State</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="state"
                className="w-full"
                aria-invalid={fieldState.invalid}
              >
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((stateItem) => (
                  <SelectItem key={stateItem.code} value={stateItem.code}>
                    {stateItem.name}
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
            <FieldLabel htmlFor="state_tax_rate">State Tax</FieldLabel>
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
    </FormSection>
  );
}
