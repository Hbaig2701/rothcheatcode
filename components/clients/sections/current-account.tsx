"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

export function CurrentAccountSection() {
  const form = useFormContext<ClientFormData>();

  return (
    <FormSection title="2. Current Account Data">
      {/* Qualified Account Value — Traditional IRA / 401(k) / pre-tax */}
      <Controller
        name="qualified_account_value"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="qualified_account_value" className="flex items-center gap-1.5">
              Qualified Account Value
              <FieldHelp {...FIELD_HELP.qualified_account_value} />
            </FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
              decimals={0}
            />
            <FieldDescription>Total value of Traditional IRA, 401(k), and other qualified accounts</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Roth IRA Balance — tax-free, compounds alongside any conversions.
          Previously only collectible via the client intake questionnaire; now
          surfaced directly so advisors can capture a complete starting net-worth
          picture in the manual flow. Schema/DB/engine all already support this. */}
      <Controller
        name="roth_ira"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="roth_ira" className="flex items-center gap-1.5">
              Roth IRA Balance
              <FieldHelp {...FIELD_HELP.roth_ira} />
            </FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
              decimals={0}
            />
            <FieldDescription>Existing Roth IRA balance — already taxed, grows tax-free. Leave at 0 if none.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Taxable Account Balance — non-retirement brokerage / savings.
          Critical when Tax Payment Source = External, since the engine will
          draw conversion taxes from this bucket. Without it, the engine treats
          conversion taxes as paid from phantom external funds. */}
      <Controller
        name="taxable_accounts"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="taxable_accounts" className="flex items-center gap-1.5">
              Taxable Account Balance
              <FieldHelp {...FIELD_HELP.taxable_accounts} />
            </FieldLabel>
            <CurrencyInput
              {...field}
              aria-invalid={fieldState.invalid}
              decimals={0}
            />
            <FieldDescription>Non-retirement brokerage and savings. Used to fund conversion taxes when Tax Payment Source is External.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    </FormSection>
  );
}
