"use client";

import { useFieldArray, useFormContext, Controller } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2, Repeat } from "lucide-react";
import { useState } from "react";
import { INCOME_TYPES, type IncomeType } from "@/lib/types/client";

export function IncomeTable() {
  const form = useFormContext<ClientFormData>();
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "non_ssi_income",
  });

  const currentAge = form.watch("age") || 62;
  const endAge = form.watch("end_age") || 95;
  const spouseAge = form.watch("spouse_age");
  const filingStatus = form.watch("filing_status");
  const isMarried = filingStatus === "married_filing_jointly";
  const currentYear = new Date().getFullYear();

  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringStartAgeStr, setRecurringStartAgeStr] = useState(String(currentAge));
  const [recurringEndAgeStr, setRecurringEndAgeStr] = useState(String(endAge));
  const [recurringGross, setRecurringGross] = useState<number | null>(null);
  const [recurringExempt, setRecurringExempt] = useState<number | null>(null);
  const [recurringType, setRecurringType] = useState<IncomeType>("other");
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const recurringStartAge = parseInt(recurringStartAgeStr) || 0;
  const recurringEndAge = parseInt(recurringEndAgeStr) || 0;

  // When opening the recurring panel, prefill with existing entry values so users
  // can see and adjust the current recurring amounts instead of starting blank
  // (which would wipe data to $0 if they click Fill without re-entering).
  const openRecurringPanel = () => {
    if (!showRecurring) {
      if (fields.length > 0) {
        const firstEntry = form.getValues("non_ssi_income.0");
        if (firstEntry) {
          setRecurringGross(firstEntry.gross_taxable ?? 0);
          setRecurringExempt(firstEntry.tax_exempt ?? 0);
          setRecurringType(firstEntry.type ?? "other");
          if (firstEntry.year) {
            const firstAge = currentAge + (firstEntry.year - currentYear);
            setRecurringStartAgeStr(String(firstAge));
          }
        }
        const lastEntry = form.getValues(`non_ssi_income.${fields.length - 1}`);
        if (lastEntry?.year) {
          const lastAge = currentAge + (lastEntry.year - currentYear);
          setRecurringEndAgeStr(String(lastAge));
        }
      } else {
        // No entries yet — reset to sensible defaults based on current client data
        setRecurringStartAgeStr(String(currentAge));
        setRecurringEndAgeStr(String(endAge));
      }
    }
    setShowRecurring(!showRecurring);
    setRecurringError(null);
  };

  // Helper to calculate age string for a given year
  const calculateAgeStr = (targetYear: number) => {
    const delta = targetYear - currentYear;
    const clientAgeAtYear = currentAge + delta;
    if (isMarried && spouseAge) {
      return `${clientAgeAtYear}/${spouseAge + delta}`;
    }
    return String(clientAgeAtYear);
  };

  const addEntry = () => {
    const lastEntryIndex = fields.length - 1;
    const lastYearVal = fields.length > 0 ? form.getValues(`non_ssi_income.${lastEntryIndex}.year`) : null;

    const nextYear = lastYearVal ? lastYearVal + 1 : currentYear;
    const nextAge = calculateAgeStr(nextYear);

    append({
      year: nextYear,
      age: nextAge,
      gross_taxable: 0,
      tax_exempt: 0,
      type: "other",
    });
  };

  const applyRecurring = () => {
    // Validate inputs
    if (!recurringStartAge || recurringStartAge < currentAge) {
      setRecurringError(`Start age must be at least ${currentAge} (current age)`);
      return;
    }
    if (!recurringEndAge || recurringEndAge < recurringStartAge) {
      setRecurringError(`Until age must be at least ${recurringStartAge} (start age)`);
      return;
    }
    if (recurringEndAge > 120) {
      setRecurringError("Age cannot exceed 120");
      return;
    }
    setRecurringError(null);

    // Translate ages to years using the client's age-year relationship.
    // Example: current age 60 in 2026, start age 67 => startYear = 2033.
    const startYear = currentYear + (recurringStartAge - currentAge);
    const endYear = currentYear + (recurringEndAge - currentAge);

    const gross = recurringGross ?? 0;
    const exempt = recurringExempt ?? 0;

    // Keep existing entries that are outside the recurring range [startYear, endYear].
    const existingOutside = fields
      .map((_, i) => form.getValues(`non_ssi_income.${i}`))
      .filter(
        (entry) =>
          entry &&
          typeof entry.year === "number" &&
          !Number.isNaN(entry.year) &&
          (entry.year < startYear || entry.year > endYear)
      );

    const newEntries = [];
    for (let year = startYear; year <= endYear; year++) {
      newEntries.push({
        year,
        age: calculateAgeStr(year),
        gross_taxable: gross,
        tax_exempt: exempt,
        type: recurringType,
      });
    }

    replace([...existingOutside, ...newEntries].sort((a, b) => a.year - b.year));
    setShowRecurring(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-medium whitespace-nowrap">Non-SSI Income</h4>
        <div className="flex flex-wrap gap-2">
          {fields.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Delete all ${fields.length} income ${fields.length === 1 ? "entry" : "entries"}?`)) {
                  replace([]);
                }
              }}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete All
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openRecurringPanel}
            className={showRecurring ? "border-primary text-primary" : ""}
          >
            <Repeat className="h-4 w-4 mr-1" />
            Recurring
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="h-4 w-4 mr-1" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Recurring income panel */}
      {showRecurring && (
        <div className="border border-primary/30 bg-accent rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-foreground font-medium">Fill recurring income</p>
            {(() => {
              const valid =
                recurringStartAge >= currentAge &&
                recurringEndAge >= recurringStartAge &&
                recurringStartAge > 0 &&
                recurringEndAge <= 120;
              if (!valid) return null;
              const startYear = currentYear + (recurringStartAge - currentAge);
              const endYear = currentYear + (recurringEndAge - currentAge);
              const yearCount = endYear - startYear + 1;
              return (
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {yearCount} {yearCount === 1 ? "year" : "years"} ({startYear}–{endYear})
                </p>
              );
            })()}
          </div>
          <p className="text-xs text-muted-foreground">
            Fills the same annual amount from a start age through a target age — useful for
            pensions, rental income, or part-time work.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label htmlFor="recurring-type" className="text-xs text-muted-foreground">Income Type</label>
                <select
                  id="recurring-type"
                  value={recurringType}
                  onChange={(e) => setRecurringType(e.target.value as IncomeType)}
                  className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2 text-sm text-foreground"
                >
                  {INCOME_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="recurring-start-age" className="text-xs text-muted-foreground">Start Age</label>
                <Input
                  id="recurring-start-age"
                  type="number"
                  min={currentAge}
                  max={120}
                  value={recurringStartAgeStr}
                  onChange={(e) => {
                    setRecurringStartAgeStr(e.target.value);
                    setRecurringError(null);
                  }}
                  aria-invalid={!!recurringError && recurringError.toLowerCase().includes("start")}
                  className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none aria-invalid:border-destructive aria-invalid:ring-destructive/20"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="recurring-end-age" className="text-xs text-muted-foreground">Until Age</label>
                <Input
                  id="recurring-end-age"
                  type="number"
                  min={recurringStartAge || currentAge}
                  max={120}
                  value={recurringEndAgeStr}
                  onChange={(e) => {
                    setRecurringEndAgeStr(e.target.value);
                    setRecurringError(null);
                  }}
                  aria-invalid={!!recurringError && (recurringError.toLowerCase().includes("until") || recurringError.toLowerCase().includes("cannot exceed"))}
                  className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none aria-invalid:border-destructive aria-invalid:ring-destructive/20"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="recurring-gross" className="text-xs text-muted-foreground">Annual Gross Taxable</label>
                <CurrencyInput
                  value={recurringGross}
                  onChange={(v) => setRecurringGross(v ?? null)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="recurring-exempt" className="text-xs text-muted-foreground">Annual Tax Exempt</label>
                <CurrencyInput
                  value={recurringExempt}
                  onChange={(v) => setRecurringExempt(v ?? null)}
                  className="h-9"
                />
              </div>
            </div>
          </div>
          {recurringError && (
            <p className="text-xs text-destructive" role="alert">{recurringError}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={applyRecurring} className="bg-gold hover:bg-primary/90 text-primary-foreground">
              {recurringEndAge >= recurringStartAge && recurringStartAge > 0
                ? `Fill ${recurringEndAge - recurringStartAge + 1} ${recurringEndAge - recurringStartAge + 1 === 1 ? "year" : "years"}`
                : "Fill"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowRecurring(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          No income entries. Click &quot;Add Entry&quot; to add annual income data, or use &quot;Recurring&quot; to bulk fill.
        </p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="text-sm min-w-full" style={{ minWidth: "560px" }}>
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-[88px]">Year</th>
                <th className="px-3 py-2 text-left font-medium w-[72px]">Age(s)</th>
                <th className="px-3 py-2 text-left font-medium w-[140px]">Type</th>
                <th className="px-3 py-2 text-left font-medium">Gross Taxable</th>
                <th className="px-3 py-2 text-left font-medium">Tax Exempt</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <IncomeTableRow
                  key={field.id}
                  index={index}
                  onRemove={() => {
                    // Look up current index by field id so stale closures over `index`
                    // from earlier renders don't delete the wrong row.
                    const currentIdx = fields.findIndex((f) => f.id === field.id);
                    remove(currentIdx >= 0 ? currentIdx : index);
                  }}
                  currentAge={currentAge}
                  spouseAge={spouseAge}
                  currentYear={currentYear}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface IncomeTableRowProps {
  index: number;
  onRemove: () => void;
  currentAge: number;
  spouseAge: number | undefined | null;
  currentYear: number;
}

function IncomeTableRow({ index, onRemove, currentAge, spouseAge, currentYear }: IncomeTableRowProps) {
  const form = useFormContext<ClientFormData>();

  // Watch year for this row
  const rowYear = form.watch(`non_ssi_income.${index}.year`);
  const filingStatus = form.watch("filing_status");
  const isMarried = filingStatus === "married_filing_jointly";

  // Calculate display age from year. Age is computed on submit in client-form.tsx,
  // so we don't need to sync it to form state here (that pattern raced with delete).
  const delta = (rowYear || currentYear) - currentYear;
  const cAge = currentAge + delta;
  const sAge = (isMarried && spouseAge) ? (spouseAge + delta) : null;
  const displayAge = sAge ? `${cAge}/${sAge}` : `${cAge}`;

  return (
    <tr className="border-t">
      <td className="px-3 py-2 align-middle">
        <Input
          type="number"
          min={2024}
          max={2100}
          className="h-9 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          {...form.register(`non_ssi_income.${index}.year`, { valueAsNumber: true })}
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="text-muted-foreground font-mono text-xs whitespace-nowrap">
          {displayAge}
        </div>
      </td>
      <td className="px-3 py-2 align-middle">
        <select
          className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-1.5 text-xs text-foreground"
          {...form.register(`non_ssi_income.${index}.type`)}
        >
          {INCOME_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-middle">
        <Controller
          name={`non_ssi_income.${index}.gross_taxable`}
          control={form.control}
          render={({ field: { ref, ...field } }) => (
            <CurrencyInput
              {...field}
              value={field.value ?? 0}
              onChange={(value) => field.onChange(value ?? 0)}
              className="h-9"
            />
          )}
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <Controller
          name={`non_ssi_income.${index}.tax_exempt`}
          control={form.control}
          render={({ field: { ref, ...field } }) => (
            <CurrencyInput
              {...field}
              value={field.value ?? 0}
              onChange={(value) => field.onChange(value ?? 0)}
              className="h-9"
            />
          )}
        />
      </td>
      <td className="px-2 py-2 align-middle">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
