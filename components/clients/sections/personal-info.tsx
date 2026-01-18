"use client";

import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFullFormData } from "@/lib/validations/client";
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
import { US_STATES } from "@/lib/data/states";

const FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
  { value: "head_of_household", label: "Head of Household" },
] as const;

export function PersonalInfoSection() {
  const form = useFormContext<ClientFullFormData>();
  const filingStatus = form.watch("filing_status");
  const isMarried = filingStatus?.includes("married");

  // Clear spouse_dob when user switches to non-married status
  useEffect(() => {
    if (!filingStatus?.includes("married")) {
      form.setValue("spouse_dob", null);
    }
  }, [filingStatus, form]);

  return (
    <FormSection title="Personal Information">
      {/* Client Name */}
      <Field data-invalid={!!form.formState.errors.name}>
        <FieldLabel htmlFor="name">Client Name</FieldLabel>
        <Input
          id="name"
          {...form.register("name")}
          aria-invalid={!!form.formState.errors.name}
        />
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      {/* Date of Birth */}
      <Field data-invalid={!!form.formState.errors.date_of_birth}>
        <FieldLabel htmlFor="date_of_birth">Date of Birth</FieldLabel>
        <Input
          id="date_of_birth"
          type="date"
          {...form.register("date_of_birth")}
          aria-invalid={!!form.formState.errors.date_of_birth}
        />
        <FieldError errors={[form.formState.errors.date_of_birth]} />
      </Field>

      {/* State of Residence */}
      <Controller
        name="state"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="state">State of Residence</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="state"
                className="w-full"
                aria-invalid={fieldState.invalid}
              >
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((state) => (
                  <SelectItem key={state.code} value={state.code}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

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

      {/* Spouse DOB - only show if married */}
      {isMarried && (
        <Field data-invalid={!!form.formState.errors.spouse_dob}>
          <FieldLabel htmlFor="spouse_dob">Spouse Date of Birth</FieldLabel>
          <Input
            id="spouse_dob"
            type="date"
            {...form.register("spouse_dob")}
            aria-invalid={!!form.formState.errors.spouse_dob}
          />
          <FieldError errors={[form.formState.errors.spouse_dob]} />
        </Field>
      )}

      {/* Life Expectancy */}
      <Field data-invalid={!!form.formState.errors.life_expectancy}>
        <FieldLabel htmlFor="life_expectancy">
          Life Expectancy (optional)
        </FieldLabel>
        <Input
          id="life_expectancy"
          type="number"
          min={1}
          max={120}
          {...form.register("life_expectancy", { valueAsNumber: true })}
          aria-invalid={!!form.formState.errors.life_expectancy}
        />
        <FieldError errors={[form.formState.errors.life_expectancy]} />
      </Field>
    </FormSection>
  );
}
