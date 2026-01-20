"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
] as const;

export function ClientDataSection() {
  const form = useFormContext<ClientFormData>();

  return (
    <FormSection title="1. Client Data">
      {/* Filing Status */}
      <Controller
        name="filing_status"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="filing_status">Filing Status</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="filing_status"
                className="w-full"
                aria-invalid={fieldState.invalid}
              >
                <SelectValue placeholder="Select filing status" />
              </SelectTrigger>
              <SelectContent>
                {FILING_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Client Name */}
      <Field data-invalid={!!form.formState.errors.name}>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <Input
          id="name"
          {...form.register("name")}
          aria-invalid={!!form.formState.errors.name}
        />
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      {/* Age */}
      <Field data-invalid={!!form.formState.errors.age}>
        <FieldLabel htmlFor="age">Age</FieldLabel>
        <Input
          id="age"
          type="number"
          min={18}
          max={100}
          {...form.register("age", { valueAsNumber: true })}
          aria-invalid={!!form.formState.errors.age}
        />
        <FieldError errors={[form.formState.errors.age]} />
      </Field>
    </FormSection>
  );
}
