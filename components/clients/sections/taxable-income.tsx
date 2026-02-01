"use client";

import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { IncomeTable } from "@/components/clients/income-table";

export function TaxableIncomeSection() {
  const form = useFormContext<ClientFormData>();
  const filingStatus = form.watch("filing_status");
  const isMarried = filingStatus === "married_filing_jointly";

  // Clear spouse SSI fields when switching to non-married
  useEffect(() => {
    if (!isMarried) {
      form.setValue("spouse_ssi_payout_age", undefined);
      form.setValue("spouse_ssi_annual_amount", undefined);
    }
  }, [isMarried, form]);

  return (
    <FormSection title="5. Taxable Income Calculation">
      {/* Client SSI Block */}
      <h3 className="text-[10px] font-bold text-[#A0A0A0] uppercase tracking-widest mb-2 border-b border-[#1F1F1F] pb-1">Client SSI</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field data-invalid={!!form.formState.errors.ssi_payout_age}>
          <FieldLabel htmlFor="ssi_payout_age">Next Payout Age</FieldLabel>
          <Input
            id="ssi_payout_age"
            type="number"
            min={62}
            max={70}
            {...form.register("ssi_payout_age", { valueAsNumber: true })}
            aria-invalid={!!form.formState.errors.ssi_payout_age}
          />
          <FieldError errors={[form.formState.errors.ssi_payout_age]} />
        </Field>

        <Controller
          name="ssi_annual_amount"
          control={form.control}
          render={({ field: { ref, ...field }, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="ssi_annual_amount">Annual Amount</FieldLabel>
              <CurrencyInput
                {...field}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>

      {/* Spouse SSI Block (Conditional) */}
      {isMarried && (
        <div className="animate-in fade-in slide-in-from-top-1 mb-4">
          <h3 className="text-[10px] font-bold text-[#A0A0A0] uppercase tracking-widest mb-2 border-b border-[#1F1F1F] pb-1">Spouse SSI</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={!!form.formState.errors.spouse_ssi_payout_age}>
              <FieldLabel htmlFor="spouse_ssi_payout_age">Next Payout Age</FieldLabel>
              <Input
                id="spouse_ssi_payout_age"
                type="number"
                min={62}
                max={70}
                {...form.register("spouse_ssi_payout_age", { valueAsNumber: true })}
                aria-invalid={!!form.formState.errors.spouse_ssi_payout_age}
              />
              <FieldError errors={[form.formState.errors.spouse_ssi_payout_age]} />
            </Field>

            <Controller
              name="spouse_ssi_annual_amount"
              control={form.control}
              render={({ field: { ref, ...field }, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="spouse_ssi_annual_amount">Annual Amount</FieldLabel>
                  <CurrencyInput
                    {...field}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </div>
        </div>
      )}

      {/* Non-SSI Income Table */}
      <div className="col-span-full pt-2">
        <IncomeTable />
      </div>
    </FormSection>
  );
}
