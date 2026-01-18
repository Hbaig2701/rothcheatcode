"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFullFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { PercentInput } from "@/components/ui/percent-input";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FEDERAL_BRACKETS } from "@/lib/data/federal-brackets";

// Filter out "auto" option for heir bracket - heirs must have explicit bracket
const HEIR_BRACKET_OPTIONS = FEDERAL_BRACKETS.filter((b) => b.value !== "auto");

export function AdvancedSection() {
  const form = useFormContext<ClientFullFormData>();

  return (
    <FormSection title="Advanced Options" description="Adjust projection assumptions">
      {/* Growth Rate */}
      <Controller
        name="growth_rate"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="growth_rate">Growth Rate</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Expected annual investment return</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Inflation Rate */}
      <Controller
        name="inflation_rate"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="inflation_rate">Inflation Rate</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Expected annual inflation</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Heir Tax Bracket */}
      <Controller
        name="heir_bracket"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Heir Tax Bracket</FieldLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select bracket" />
              </SelectTrigger>
              <SelectContent>
                {HEIR_BRACKET_OPTIONS.map((bracket) => (
                  <SelectItem key={bracket.value} value={bracket.value}>
                    {bracket.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Bracket for inherited IRA taxation</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Projection Years */}
      <Field data-invalid={!!form.formState.errors.projection_years}>
        <FieldLabel htmlFor="projection_years">Projection Years</FieldLabel>
        <Input
          id="projection_years"
          type="number"
          min={10}
          max={60}
          {...form.register("projection_years", { valueAsNumber: true })}
        />
        <FieldDescription>Number of years to project (10-60)</FieldDescription>
        <FieldError errors={[form.formState.errors.projection_years]} />
      </Field>

      {/* Widow Analysis Checkbox */}
      <Field>
        <div className="flex items-center gap-2">
          <input
            id="widow_analysis"
            type="checkbox"
            {...form.register("widow_analysis")}
            className="h-4 w-4 rounded border-gray-300"
          />
          <FieldLabel htmlFor="widow_analysis">Widow Analysis</FieldLabel>
        </div>
        <FieldDescription>Include single-filer impact analysis</FieldDescription>
      </Field>

      {/* Sensitivity Analysis Checkbox */}
      <Field>
        <div className="flex items-center gap-2">
          <input
            id="sensitivity"
            type="checkbox"
            {...form.register("sensitivity")}
            className="h-4 w-4 rounded border-gray-300"
          />
          <FieldLabel htmlFor="sensitivity">Sensitivity Analysis</FieldLabel>
        </div>
        <FieldDescription>Run sensitivity analysis on key assumptions</FieldDescription>
      </Field>
    </FormSection>
  );
}
