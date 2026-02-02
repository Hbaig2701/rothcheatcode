"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";

const WITHDRAWAL_TYPE_OPTIONS = [
  { value: "no_withdrawals", label: "No Withdrawals" },
  { value: "systematic", label: "Systematic Withdrawals" },
  { value: "penalty_free", label: "Penalty-Free Withdrawals Only" },
] as const;

export function RothWithdrawalsSection() {
  const form = useFormContext<ClientFormData>();
  const formulaType = form.watch("blueprint_type") as FormulaType;

  // Hide withdrawal section for GI products (withdrawals managed by GI engine)
  if (isGuaranteedIncomeProduct(formulaType)) {
    return null;
  }

  return (
    <FormSection title="7. Roth Withdrawals">
      {/* Withdrawal Type */}
      <Controller
        name="withdrawal_type"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Withdrawal Type</FieldLabel>
            <div className="space-y-2">
              {WITHDRAWAL_TYPE_OPTIONS.map((option) => (
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
            <FieldDescription>How Roth withdrawals are handled in the simulation</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  );
}
