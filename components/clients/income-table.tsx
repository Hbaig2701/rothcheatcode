"use client";

import { useFieldArray, useFormContext, Controller } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2, Repeat } from "lucide-react";
import { useState } from "react";

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
  const [recurringEndAgeStr, setRecurringEndAgeStr] = useState(String(endAge));
  const [recurringGross, setRecurringGross] = useState<number | null>(null);
  const [recurringExempt, setRecurringExempt] = useState<number | null>(null);
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const recurringEndAge = parseInt(recurringEndAgeStr) || 0;

  // When opening the recurring panel, prefill with existing entry values so users
  // can see and adjust the current recurring amounts instead of starting blank
  // (which would wipe data to $0 if they click Fill without re-entering).
  const openRecurringPanel = () => {
    if (!showRecurring && fields.length > 0) {
      const firstEntry = form.getValues("non_ssi_income.0");
      if (firstEntry) {
        setRecurringGross(firstEntry.gross_taxable ?? 0);
        setRecurringExempt(firstEntry.tax_exempt ?? 0);
      }
      // Sync Until Age to the last entry's age
      const lastEntry = form.getValues(`non_ssi_income.${fields.length - 1}`);
      if (lastEntry?.year) {
        const lastAge = currentAge + (lastEntry.year - currentYear);
        setRecurringEndAgeStr(String(lastAge));
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
    });
  };

  const applyRecurring = () => {
    const startYear = currentYear;
    const yearsToFill = recurringEndAge - currentAge;

    if (recurringEndAge <= currentAge) {
      setRecurringError(`Must be greater than client's current age (${currentAge})`);
      return;
    }
    if (recurringEndAge > 120) {
      setRecurringError("Age cannot exceed 120");
      return;
    }
    setRecurringError(null);

    const gross = recurringGross ?? 0;
    const exempt = recurringExempt ?? 0;

    // Keep existing entries that are outside the recurring range, replace those inside.
    // The recurring range is [startYear, endYear] inclusive, since the loop below
    // creates an entry for every year up to and including endYear.
    const endYear = startYear + yearsToFill;
    const existingOutside = fields
      .map((_, i) => {
        const vals = form.getValues(`non_ssi_income.${i}`);
        return vals;
      })
      .filter((entry) => entry.year < startYear || entry.year > endYear);

    const newEntries = [];
    for (let i = 0; i <= yearsToFill; i++) {
      const year = startYear + i;
      newEntries.push({
        year,
        age: calculateAgeStr(year),
        gross_taxable: gross,
        tax_exempt: exempt,
      });
    }

    replace([...existingOutside, ...newEntries].sort((a, b) => a.year - b.year));
    setShowRecurring(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Non-SSI Income</h4>
        <div className="flex gap-2">
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
          <p className="text-sm text-foreground font-medium">Fill recurring income</p>
          <p className="text-xs text-muted-foreground">
            Automatically create entries from now until a target age with the same amounts.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Until Age</label>
              <Input
                type="number"
                value={recurringEndAgeStr}
                onChange={(e) => {
                  setRecurringEndAgeStr(e.target.value);
                  setRecurringError(null);
                }}
                className={`h-8 ${recurringError ? "border-destructive" : ""}`}
              />
              {recurringError && (
                <p className="text-xs text-destructive">{recurringError}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Annual Gross Taxable</label>
              <CurrencyInput
                value={recurringGross}
                onChange={(v) => setRecurringGross(v ?? null)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Annual Tax Exempt</label>
              <CurrencyInput
                value={recurringExempt}
                onChange={(v) => setRecurringExempt(v ?? null)}
                className="h-8"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={applyRecurring} className="bg-gold hover:bg-primary/90 text-primary-foreground">
              {recurringEndAge > currentAge ? `Fill ${recurringEndAge - currentAge + 1} years` : "Fill"}
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
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Year</th>
                <th className="px-2 py-2 text-left font-medium">Age(s)</th>
                <th className="px-2 py-2 text-left font-medium">Gross Taxable</th>
                <th className="px-2 py-2 text-left font-medium">Tax Exempt</th>
                <th className="px-1 py-2 w-8"></th>
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
      <td className="px-2 py-1.5">
        <Input
          type="number"
          min={2024}
          max={2100}
          className="w-[4.5rem] h-8"
          {...form.register(`non_ssi_income.${index}.year`, { valueAsNumber: true })}
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="h-8 flex items-center px-2 bg-muted/20 rounded-sm text-muted-foreground font-mono text-xs whitespace-nowrap">
          {displayAge}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <Controller
          name={`non_ssi_income.${index}.gross_taxable`}
          control={form.control}
          render={({ field: { ref, ...field } }) => (
            <CurrencyInput
              {...field}
              value={field.value ?? 0}
              onChange={(value) => field.onChange(value ?? 0)}
              className="w-24 h-8"
            />
          )}
        />
      </td>
      <td className="px-2 py-1.5">
        <Controller
          name={`non_ssi_income.${index}.tax_exempt`}
          control={form.control}
          render={({ field: { ref, ...field } }) => (
            <CurrencyInput
              {...field}
              value={field.value ?? 0}
              onChange={(value) => field.onChange(value ?? 0)}
              className="w-24 h-8"
            />
          )}
        />
      </td>
      <td className="px-1 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
