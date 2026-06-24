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
import { CurrencyInput } from "@/components/ui/currency-input";
import { Checkbox } from "@/components/ui/checkbox";
import { US_STATES, getDefaultStateTaxRate } from "@/lib/data/states";
import { Lock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

// Only two active values now. 'none' and 'fixed_amount' were dead code
// (engine never read them — collapsed identically to 'bracket_ceiling'),
// retired 2026-06-05. Existing rows with those values were migrated to
// 'bracket_ceiling' in the same change.
const CONSTRAINT_OPTIONS = [
  { value: "bracket_ceiling", label: "Bracket Ceiling only" },
  { value: "irmaa_threshold", label: "Bracket Ceiling + IRMAA Tier cap" },
] as const;

// IRMAA target tier dropdown, only rendered when the advisor picks the
// IRMAA option. Labels show the actual annual surcharge so the advisor can
// pick deliberately, not just "tier 2" abstractly.
const IRMAA_TARGET_TIER_OPTIONS = [
  { value: "standard", label: "Standard (no surcharge)" },
  { value: "tier_1", label: "Tier 1 (~$840/yr single, $1,680 couple)" },
  { value: "tier_2", label: "Tier 2 (~$2,100/yr single, $4,200 couple)" },
  { value: "tier_3", label: "Tier 3 (~$3,360/yr single, $6,720 couple)" },
  { value: "tier_4", label: "Tier 4 (~$4,620/yr single, $9,240 couple)" },
  { value: "tier_5", label: "Tier 5 (no IRMAA cap — convert freely)" },
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

  // Watch constraint_type so the IRMAA target dropdown can show/hide.
  // Watch as a known union so old DB rows with legacy values ('none' |
  // 'fixed_amount') don't trip the conditional render — those would have
  // been migrated to 'bracket_ceiling' but defensive narrowing still helps.
  const constraintType = form.watch("constraint_type");
  const showIrmaaTargetPicker = constraintType === "irmaa_threshold";

  return (
    <FormSection title="4. Tax Data">
      {/* Additional Constraint — formerly labeled "Constraint." Renamed
          2026-06-05 to make the relationship to Max Tax Rate explicit:
          bracket ceiling is ALWAYS active (via max_tax_rate), and this
          dropdown picks whether an *additional* IRMAA cap layers on top. */}
      <Controller
        name="constraint_type"
        control={form.control}
        render={({ field, fieldState }) => {
          // Show "Bracket Ceiling only" if the stored value is a legacy
          // dead-code value ('none' / 'fixed_amount') — those collapsed to
          // bracket_ceiling at the engine, so the display should match.
          const effectiveValue = (field.value === "none" || field.value === "fixed_amount")
            ? "bracket_ceiling"
            : field.value;
          const selectedOption = CONSTRAINT_OPTIONS.find(opt => opt.value === effectiveValue);
          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="constraint_type" className="flex items-center gap-1.5">
                Additional Constraint
                <FieldHelp {...FIELD_HELP.constraint_type} />
              </FieldLabel>
              <Select value={effectiveValue} onValueChange={field.onChange}>
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
              <FieldDescription>
                Bracket Ceiling (via Max Tax Rate below) is always applied. Pick whether to ALSO cap conversions to keep MAGI under a chosen IRMAA tier.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          );
        }}
      />

      {/* IRMAA target tier picker — only visible when the advisor chose
          IRMAA. When constraint_type is bracket_ceiling, the engine ignores
          this value, so hiding it removes a redundant input. */}
      {showIrmaaTargetPicker && (
        <Controller
          name="target_irmaa_tier"
          control={form.control}
          render={({ field, fieldState }) => {
            const currentValue = field.value ?? "standard";
            const selectedOption = IRMAA_TARGET_TIER_OPTIONS.find(opt => opt.value === currentValue);
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="target_irmaa_tier" className="flex items-center gap-1.5">
                  Target IRMAA Tier
                  <FieldHelp {...FIELD_HELP.target_irmaa_tier} />
                </FieldLabel>
                <Select value={currentValue} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="target_irmaa_tier"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Select tier">
                      {selectedOption?.label ?? "Select tier"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {IRMAA_TARGET_TIER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Engine caps each year&apos;s conversion so MAGI stays under this tier&apos;s ceiling. If the client&apos;s baseline income is already above the chosen tier, the engine falls back to the client&apos;s actual current tier (won&apos;t convert into a higher tier than they&apos;re already in) and the dashboard flags it.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            );
          }}
        />
      )}

      {/* "Current Bracket (informational)" tax_rate field was removed
          2026-06-05. It was load-bearing only for GI projections (used as a
          flat baseline tax rate) but labeled as informational, which was
          misleading. The GI engine now derives baseline tax from year-by-year
          bracket-aware math (federal + state + IRMAA via the same modules
          the Growth FIA engine uses), so this input is no longer needed
          anywhere. The DB column stays for backward compatibility with
          historical projections; the Zod schema treats it as optional with
          default 0. */}

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

      {/* Additional Deductions — offsets conversion income beyond the standard
          deduction (charitable/itemized, business losses/NOLs, leveraged-
          deduction programs). Added on top of the standard deduction, so a
          conversion shielded by these shows lower (or zero) tax. */}
      <Controller
        name="additional_deductions"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="additional_deductions">
              Additional Deductions
            </FieldLabel>
            <CurrencyInput
              {...field}
              value={field.value ?? undefined}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>
              Annual deductions beyond the standard deduction (charitable/itemized,
              business losses, leveraged-deduction programs). Applied on top of the
              standard deduction each year to lower the tax on conversions.
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Tax Credits — offsets tax OWED dollar-for-dollar (unlike a deduction,
          which only reduces taxable income). Entered as the TOTAL available
          credit; the engine draws it down against federal income tax each year
          and carries the unused balance forward until it's used up. */}
      <Controller
        name="tax_credits"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="tax_credits">
              Tax Credits
            </FieldLabel>
            <CurrencyInput
              {...field}
              value={field.value ?? undefined}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>
              Total available tax credits (e.g. disaster-relief carryover credits).
              Offsets federal income tax dollar-for-dollar — not just taxable income
              like a deduction — and the unused balance carries forward year to year
              until it&apos;s used up.
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
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

      {/* RMD Treatment (Baseline Scenario) - Only for Growth products.
          Hidden when "RMDs Handled Externally" is on, because there are no
          RMDs in either scenario to treat. */}
      {!isGI && !form.watch("rmds_handled_externally") && (
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

      {/* RMDs Handled Externally — split-bucket strategy support. When ON
          the engine skips RMD computation entirely (both baseline AND
          strategy) so the modeled bucket doesn't get RMDs eating into the
          conversion target. Available for both Growth FIA and GI products
          since GI strategies can also have a split-bucket setup. */}
      <Controller
        name="rmds_handled_externally"
        control={form.control}
        render={({ field }) => (
          <div className="sm:col-span-2 lg:col-span-3 flex flex-row items-start gap-3">
            <Checkbox
              id="rmds_handled_externally"
              checked={field.value}
              onCheckedChange={field.onChange}
              className="mt-0.5 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <label
                htmlFor="rmds_handled_externally"
                className="inline-flex items-center gap-1.5 text-sm font-medium cursor-pointer"
              >
                RMDs Handled Externally
                <FieldHelp {...FIELD_HELP.rmds_handled_externally} />
              </label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Skips RMD calculation on this bucket entirely. Use when the client&apos;s real-world RMDs
                come from a separate IRA (e.g., a different custodian) not modeled here. Both the baseline
                and strategy projections will skip RMDs equally to keep the comparison fair.
              </p>
            </div>
          </div>
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
