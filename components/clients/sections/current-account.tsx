"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";
import { useInputFeature, HiddenFeatureNote } from "@/components/clients/use-input-feature";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";

export function CurrentAccountSection() {
  const form = useFormContext<ClientFormData>();
  // Optional (Settings → Input Panel, off by default): after-tax IRA basis.
  const iraBasis = useInputFeature("ira_basis");
  const formulaType = useWatch({ control: form.control, name: "blueprint_type" }) as FormulaType;
  const isGI = isGuaranteedIncomeProduct(formulaType);

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

      {/* After-tax IRA basis (Form 8606) — recovered pro-rata from every IRA
          distribution (utils/ira-basis.ts). Optional feature, hidden unless
          the advisor turns it on in Settings or this client already uses it. */}
      {iraBasis.show && (
        <Controller
          name="ira_basis"
          control={form.control}
          render={({ field: { ref, ...field }, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="ira_basis" className="flex items-center gap-1.5">
                IRA Basis (Form 8606)
                <FieldHelp {...FIELD_HELP.ira_basis} />
              </FieldLabel>
              <CurrencyInput
                {...field}
                value={field.value ?? undefined}
                aria-invalid={fieldState.invalid}
                decimals={0}
              />
              <FieldDescription>
                {isGI
                  ? "Not applied to Guaranteed Income products yet. Used by Growth and No Annuity scenarios."
                  : "After-tax dollars already in the IRA above (Form 8606, line 14). Released tax-free pro-rata on conversions and RMDs. Leave at 0 if none."}
              </FieldDescription>
              {iraBasis.forced && <HiddenFeatureNote />}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

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
