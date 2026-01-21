"use client";

import { useFormContext } from "react-hook-form";
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
import { Controller } from "react-hook-form";

const FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
] as const;

export function ClientDataSection() {
  const form = useFormContext<ClientFormData>();
  const filingStatus = form.watch("filing_status");

  const isMarried = filingStatus === "married_filing_jointly";

  return (
    <FormSection title="1. Client Data">

      {/* Filing Status */}
      <div className="space-y-4">
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

        {/* Client Name & Age */}
        <div className="grid grid-cols-3 gap-3">
          <Field className="col-span-2" data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              {...form.register("name")}
              aria-invalid={!!form.formState.errors.name}
            />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>

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
        </div>

        {/* Spouse Name & Age (Conditional) */}
        {isMarried && (
          <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-1">
            <Field className="col-span-2" data-invalid={!!form.formState.errors.spouse_name}>
              <FieldLabel htmlFor="spouse_name">Spouse Name</FieldLabel>
              <Input
                id="spouse_name"
                {...form.register("spouse_name")}
                aria-invalid={!!form.formState.errors.spouse_name}
              />
              <FieldError errors={[form.formState.errors.spouse_name]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.spouse_age}>
              <FieldLabel htmlFor="spouse_age">Spouse Age</FieldLabel>
              <Input
                id="spouse_age"
                type="number"
                min={18}
                max={100}
                {...form.register("spouse_age", { valueAsNumber: true })}
                aria-invalid={!!form.formState.errors.spouse_age}
              />
              <FieldError errors={[form.formState.errors.spouse_age]} />
            </Field>
          </div>
        )}
      </div>
    </FormSection>
  );
}
