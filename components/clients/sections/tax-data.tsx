"use client";

import { useEffect, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
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
import { Checkbox } from "@/components/ui/checkbox";
import { US_STATES, getDefaultStateTaxRate } from "@/lib/data/states";
import { Lock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

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

const RMD_TREATMENT_OPTIONS = [
  { value: "spent", label: "Spent on Living Expenses", description: "RMDs are consumed during retirement" },
  { value: "reinvested", label: "Reinvested (Taxable Brokerage)", description: "RMDs grow at rate of return" },
  { value: "cash", label: "Sits in Cash (No Growth)", description: "RMDs accumulate without growth" },
] as const;

// Valid federal tax brackets - must match what's in federal-brackets-2026.ts
// 0% means "fill up to standard deduction so taxable income stays at $0" — used for
// low-income clients (e.g., military with disability income, retirees living off
// tax-exempt sources) who want to convert without triggering any federal tax.
const TAX_BRACKET_OPTIONS = [
  { value: 0, label: "0% (fill to standard deduction only)" },
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
  const formulaType = form.watch("blueprint_type") as FormulaType;
  const isGI = isGuaranteedIncomeProduct(formulaType);

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
              <FieldLabel htmlFor="constraint_type" className="flex items-center gap-1.5">
                Constraint
                <FieldHelp {...FIELD_HELP.constraint_type} />
              </FieldLabel>
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
            <FieldLabel htmlFor="tax_rate" className="flex items-center gap-1.5">
              Current Bracket (informational)
              <FieldHelp {...FIELD_HELP.tax_rate} />
            </FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>
              Client&apos;s current marginal federal bracket. For reference only — not used in
              the projection math. The Max Tax Rate below is what drives conversion decisions.
            </FieldDescription>
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
              <FieldLabel htmlFor="max_tax_rate" className="flex items-center gap-1.5">
                Max Tax Rate
                <FieldHelp {...FIELD_HELP.max_tax_rate} />
              </FieldLabel>
              <Select
                value={field.value?.toString() ?? ""}
                onValueChange={(val) => {
                  if (val) field.onChange(parseInt(val, 10));
                }}
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
            <FieldLabel className="flex items-center gap-1.5">
              Tax Payment Source
              <FieldHelp {...FIELD_HELP.tax_payment_source} />
            </FieldLabel>
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

      {/* Carrier penalty-free cap toggle. Only meaningful when tax is paid
          from the IRA — when the client funds tax from outside cash, no
          dollars leave the contract and the carrier's penalty-free allowance
          is never tripped. Hidden in that case to keep the section uncluttered. */}
      {/* Penalty-free cap is shown for BOTH tax sources. With "from_ira" the
          cap binds either the tax payment (tax_only scope) or the total
          outflow (all_distributions scope). With "from_taxable" the cap is
          a no-op under tax_only (no money leaves the contract) but DOES
          still bind under all_distributions because the conversion itself
          is a withdrawal from the qualified IRA. So the toggle must remain
          configurable regardless of tax source. */}
      <Controller
        name="respect_penalty_free_limit"
        control={form.control}
        render={({ field }) => (
          <div className="sm:col-span-2 lg:col-span-3 flex flex-row items-start gap-3">
            <Checkbox
              id="respect_penalty_free_limit"
              checked={field.value}
              onCheckedChange={field.onChange}
              className="mt-0.5 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <label
                htmlFor="respect_penalty_free_limit"
                className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer"
              >
                Respect Contract Penalty-Free Limit
                <FieldHelp {...FIELD_HELP.respect_penalty_free_limit} />
              </label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Caps each year&apos;s withdrawal at the carrier&apos;s
                penalty-free allowance (typically {form.watch("penalty_free_percent") ?? 10}% of
                the prior anniversary value). What counts toward that cap depends
                on the option below. Cap releases automatically once the
                surrender period ends.
              </p>
            </div>
          </div>
        )}
      />

      {/* Sub-option: what counts toward the cap. Only relevant when the
          parent toggle is ON. Default 'tax_only' preserves the existing
          behavior for every client that already has the toggle on. */}
      {form.watch("respect_penalty_free_limit") && (
        <Controller
          name="penalty_free_scope"
          control={form.control}
          render={({ field }) => (
            <div className="sm:col-span-2 lg:col-span-3 ml-7 mt-1 flex flex-col gap-2 border-l-2 border-border-default pl-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-dim uppercase tracking-wider">
                What counts toward the {form.watch("penalty_free_percent") ?? 10}% cap?
                <FieldHelp {...FIELD_HELP.penalty_free_scope} />
              </span>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="tax_only"
                  checked={field.value === "tax_only"}
                  onChange={() => field.onChange("tax_only")}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">
                    Only the tax payment (default)
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The Roth conversion stays inside the same carrier (Trad → Roth)
                    and does not count as a withdrawal. Only dollars pulled from
                    the IRA to pay the conversion tax count toward the cap. Has
                    no effect when tax is paid from outside the IRA. Most common
                    interpretation for products like Allianz where the conversion
                    is an intra-carrier transfer.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="all_distributions"
                  checked={field.value === "all_distributions"}
                  onChange={() => field.onChange("all_distributions")}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">
                    Every dollar that leaves the IRA (strict)
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Conversion + RMD + tax-from-IRA all count toward the cap.
                    This forces the engine to size conversions much smaller so
                    the total annual outflow never exceeds the carrier&apos;s
                    penalty-free allowance. Applies even when tax is paid from
                    outside the IRA (the conversion itself is still a withdrawal).
                    Use this when the carrier&apos;s contract treats the
                    conversion as a withdrawal.
                  </p>
                </div>
              </label>
            </div>
          )}
        />
      )}

      {/* RMD Treatment (Baseline Scenario) - Only for Growth products */}
      {!isGI && (
        <Controller
          name="rmd_treatment"
          control={form.control}
          render={({ field, fieldState }) => {
            const selectedOption = RMD_TREATMENT_OPTIONS.find(opt => opt.value === field.value);
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="rmd_treatment" className="flex items-center gap-1.5">
                  RMD Treatment (Baseline)
                  <FieldHelp {...FIELD_HELP.rmd_treatment} />
                </FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="rmd_treatment"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Select RMD treatment">
                      {selectedOption?.label ?? "Select RMD treatment"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RMD_TREATMENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>How RMDs are handled in the &quot;do nothing&quot; baseline scenario</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            );
          }}
        />
      )}

      {/* State */}
      <Controller
        name="state"
        control={form.control}
        render={({ field, fieldState }) => {
          const selectedState = US_STATES.find(s => s.code === field.value);
          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="state" className="flex items-center gap-1.5">
                State
                <FieldHelp {...FIELD_HELP.state} />
              </FieldLabel>
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
              <FieldHelp {...FIELD_HELP.state_tax_rate} />
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
