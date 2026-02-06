"use client";

import { useEffect, useState } from "react";
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
import { Lock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

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

// Valid federal tax brackets - must match what's in federal-brackets-2026.ts
const TAX_BRACKET_OPTIONS = [
  { value: 10, label: "10%" },
  { value: 12, label: "12%" },
  { value: 22, label: "22%" },
  { value: 24, label: "24%" },
  { value: 32, label: "32%" },
  { value: 35, label: "35%" },
  { value: 37, label: "37%" },
] as const;

export function TaxDataSection() {
  const form = useFormContext<ClientFormData>();
  const state = form.watch("state");
  const currentStateTaxRate = form.watch("state_tax_rate");

  // Track if user is manually editing state tax
  const [isManualEdit, setIsManualEdit] = useState(false);

  // Check on mount if the current value differs from preset (indicates manual edit)
  useEffect(() => {
    if (state && state.length === 2 && currentStateTaxRate !== null && currentStateTaxRate !== undefined) {
      const presetRate = getDefaultStateTaxRate(state);
      if (Math.abs(currentStateTaxRate - presetRate) > 0.01) {
        setIsManualEdit(true);
      }
    }
  }, []); // Only run on mount

  // Auto-update state tax rate when state changes (only if not in manual edit mode)
  useEffect(() => {
    if (!isManualEdit && state && state.length === 2) {
      const defaultRate = getDefaultStateTaxRate(state);
      form.setValue("state_tax_rate", defaultRate);
    }
  }, [state, form, isManualEdit]);

  const handleManualEdit = () => {
    setIsManualEdit(true);
  };

  const handleUsePreset = () => {
    setIsManualEdit(false);
    if (state && state.length === 2) {
      const defaultRate = getDefaultStateTaxRate(state);
      form.setValue("state_tax_rate", defaultRate);
    }
  };

  return (
    <FormSection title="4. Tax Data">
      {/* Constraint */}
      <Controller
        name="constraint_type"
        control={form.control}
        render={({ field, fieldState }) => {
          const selectedOption = CONSTRAINT_OPTIONS.find(opt => opt.value === field.value);
          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="constraint_type">Constraint</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="constraint_type"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Select constraint">
                    {selectedOption?.label ?? "Select constraint"}
                  </SelectValue>
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
          );
        }}
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

      {/* Max Tax Rate - Dropdown with valid brackets only */}
      <Controller
        name="max_tax_rate"
        control={form.control}
        render={({ field, fieldState }) => {
          const selectedOption = TAX_BRACKET_OPTIONS.find(opt => opt.value === field.value);
          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="max_tax_rate">Max Tax Rate</FieldLabel>
              <Select
                value={field.value?.toString() ?? ""}
                onValueChange={(val) => field.onChange(parseInt(val, 10))}
              >
                <SelectTrigger
                  id="max_tax_rate"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Select bracket">
                    {selectedOption?.label ?? "Select bracket"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TAX_BRACKET_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Target tax bracket ceiling for conversions</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          );
        }}
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
        render={({ field, fieldState }) => {
          const selectedState = US_STATES.find(s => s.code === field.value);
          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="state">State</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="state"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Select state">
                    {selectedState?.name ?? "Select state"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[...US_STATES].sort((a, b) => a.name.localeCompare(b.name)).map((stateItem) => (
                    <SelectItem key={stateItem.code} value={stateItem.code}>
                      {stateItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          );
        }}
      />

      {/* State Tax Rate */}
      <Controller
        name="state_tax_rate"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="state_tax_rate" className="flex items-center gap-1.5">
              State Tax
              {!isManualEdit && <Lock className="size-3 text-muted-foreground" />}
            </FieldLabel>
            <PercentInput
              {...field}
              value={field.value ?? undefined}
              aria-invalid={fieldState.invalid}
              disabled={!isManualEdit}
              className={cn(!isManualEdit && "opacity-60 cursor-not-allowed bg-muted/30")}
            />
            {isManualEdit ? (
              <button
                type="button"
                onClick={handleUsePreset}
                className="text-xs text-primary hover:text-primary/80 hover:underline flex items-center gap-1 mt-1"
              >
                <Lock className="size-3" />
                Use Preset Rate
              </button>
            ) : (
              <button
                type="button"
                onClick={handleManualEdit}
                className="text-xs text-primary hover:text-primary/80 hover:underline flex items-center gap-1 mt-1"
              >
                <Pencil className="size-3" />
                Manually Edit
              </button>
            )}
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  );
}
