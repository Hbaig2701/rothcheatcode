"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Controller } from "react-hook-form";
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";

const FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married Filing Jointly" },
  { value: "married_filing_separately", label: "Married Filing Separately" },
] as const;

// Age is required either way: in date-of-birth mode it's derived from the DOB
// (age reached during the current year) so end-age and the other age checks
// keep working unchanged.
function AgeOrBirthDateField({
  person,
  label,
  placeholder,
}: {
  person: "client" | "spouse";
  label: string;
  placeholder: string;
}) {
  const form = useFormContext<ClientFormData>();
  const ageName = person === "client" ? "age" : "spouse_age";
  const dobName = person === "client" ? "date_of_birth" : "spouse_dob";
  const exactName = person === "client" ? "date_of_birth_exact" : "spouse_dob_exact";
  const help = person === "client" ? FIELD_HELP.age : FIELD_HELP.spouse_age;

  const exact = !!form.watch(exactName);
  const dob = form.watch(dobName);
  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const ageError = form.formState.errors[ageName];
  const dobError = form.formState.errors[dobName];

  const setAgeFromDob = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      form.setValue(ageName, currentYear - parseInt(value.slice(0, 4), 10), { shouldValidate: true, shouldDirty: true });
    }
  };

  return (
    <Field
      data-invalid={!!(exact ? dobError ?? ageError : ageError)}
      className={person === "spouse" ? "animate-in fade-in slide-in-from-top-1" : undefined}
    >
      <FieldLabel htmlFor={exact ? dobName : ageName} className="flex items-center gap-1.5">
        {exact ? (person === "client" ? "Date of Birth" : "Spouse Date of Birth") : label}
        <FieldHelp {...help} />
      </FieldLabel>
      {/* Distinct keys so React mounts a separate <input> for each mode.
          Without them it reused one element, the form library kept it
          registered as Age, and setting the age from the DOB wrote "73" into
          the date box — wiping the date the moment it was complete. */}
      {exact ? (
        <Input
          key={dobName}
          id={dobName}
          type="date"
          min="1900-01-01"
          max={today}
          {...form.register(dobName, {
            onChange: (e) => setAgeFromDob(e.target.value),
            // A half-typed date reads as "" in the DOM but the browser doesn't
            // always fire a change for it, so the form would keep (and save) the
            // last complete date while the box shows something else. Re-sync on
            // blur so a partial entry surfaces "Date of birth is required".
            onBlur: (e) => {
              if (!e.target.value && form.getValues(dobName)) {
                form.setValue(dobName, "", { shouldValidate: true, shouldDirty: true });
              }
            },
          })}
          aria-invalid={!!dobError}
        />
      ) : (
        <Input
          key={ageName}
          id={ageName}
          type="number"
          min={18}
          max={100}
          placeholder={placeholder}
          {...form.register(ageName, { valueAsNumber: true })}
          // Empty by default with a ghost-label placeholder; select on focus so
          // editing an existing value replaces it cleanly.
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={!!ageError}
        />
      )}
      <Controller
        name={exactName}
        control={form.control}
        render={({ field }) => (
          // w-fit + self-start: only the box and its text toggle it — a full-width
          // label made clicks in the empty space beside it untick the checkbox.
          <label className="flex w-fit self-start items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={!!field.value}
              onCheckedChange={(checked) => {
                field.onChange(!!checked);
                if (checked && typeof dob === "string") setAgeFromDob(dob);
              }}
            />
            Enter date of birth instead
          </label>
        )}
      />
      {exact && (
        <FieldDescription>
          {typeof dob === "string" && dob
            ? <>Reaches age {currentYear - parseInt(dob.slice(0, 4), 10)} in {currentYear}. </>
            : null}
          Ages in the report are the age reached during each year.
        </FieldDescription>
      )}
      <FieldError errors={[exact ? dobError ?? ageError : ageError]} />
    </Field>
  );
}

export function ClientDataSection() {
  const form = useFormContext<ClientFormData>();
  const filingStatus = form.watch("filing_status");

  const isMarried = filingStatus === "married_filing_jointly";

  // Clear spouse fields when switching to non-married so a stale value doesn't
  // linger or trip the "spouse age required" check. When switching TO married
  // we intentionally leave spouse_age empty — the advisor enters the real age
  // (placeholder + required validation), no silent 60 default.
  useEffect(() => {
    if (!isMarried) {
      form.setValue("spouse_name", undefined);
      form.setValue("spouse_age", undefined);
      form.setValue("spouse_dob", null);
      form.setValue("spouse_dob_exact", false);
    }
  }, [isMarried, form]);

  return (
    <FormSection title="1. Client Data" defaultOpen>
      {/* Scenario Name (Optional) */}
      <Field data-invalid={!!form.formState.errors.scenario_name}>
        <FieldLabel htmlFor="scenario_name" className="flex items-center gap-1.5">
          Scenario Name (Optional)
          <FieldHelp {...FIELD_HELP.scenario_name} />
        </FieldLabel>
        <Input
          id="scenario_name"
          placeholder="e.g. Aggressive Strategy"
          {...form.register("scenario_name", { setValueAs: v => v === "" ? null : v })}
          aria-invalid={!!form.formState.errors.scenario_name}
        />
        <FieldError errors={[form.formState.errors.scenario_name]} />
      </Field>

      {/* Filing Status */}
      <Controller
        name="filing_status"
        control={form.control}
        render={({ field, fieldState }) => {
          const selectedOption = FILING_STATUS_OPTIONS.find(opt => opt.value === field.value);
          return (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="filing_status" className="flex items-center gap-1.5">
                Filing Status
                <FieldHelp {...FIELD_HELP.filing_status} />
              </FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="filing_status"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Select filing status">
                    {selectedOption?.label ?? "Select filing status"}
                  </SelectValue>
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
          );
        }}
      />

      {/* Client Name */}
      <Field data-invalid={!!form.formState.errors.name}>
        <FieldLabel htmlFor="name" className="flex items-center gap-1.5">
          Name
          <FieldHelp {...FIELD_HELP.name} />
        </FieldLabel>
        <Input
          id="name"
          {...form.register("name")}
          aria-invalid={!!form.formState.errors.name}
        />
        <FieldError errors={[form.formState.errors.name]} />
      </Field>

      {/* Client Age / Date of Birth */}
      <AgeOrBirthDateField person="client" label="Age" placeholder="e.g. 62" />

      {/* Spouse Name (Conditional) */}
      {isMarried && (
        <Field data-invalid={!!form.formState.errors.spouse_name} className="animate-in fade-in slide-in-from-top-1">
          <FieldLabel htmlFor="spouse_name" className="flex items-center gap-1.5">
            Spouse Name
            <FieldHelp {...FIELD_HELP.spouse_name} />
          </FieldLabel>
          <Input
            id="spouse_name"
            {...form.register("spouse_name")}
            aria-invalid={!!form.formState.errors.spouse_name}
          />
          <FieldError errors={[form.formState.errors.spouse_name]} />
        </Field>
      )}

      {/* Spouse Age / Date of Birth (Conditional) */}
      {isMarried && <AgeOrBirthDateField person="spouse" label="Spouse Age" placeholder="e.g. 60" />}
    </FormSection>
  );
}
