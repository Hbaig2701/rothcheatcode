"use client";

import { useFieldArray, useFormContext, Controller } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

export function IncomeTable() {
  const form = useFormContext<ClientFormData>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "non_ssi_income",
  });

  const currentAge = form.watch("age") || 62;
  const spouseAge = form.watch("spouse_age");
  const filingStatus = form.watch("filing_status");
  const isMarried = filingStatus === "married_filing_jointly";
  const currentYear = new Date().getFullYear();

  // Helper to calculate age string "62" or "62/60" for a given year
  const calculateAgeStr = (targetYear: number) => {
    const delta = targetYear - currentYear;
    const clientAgeAtYear = currentAge + delta;

    if (isMarried && spouseAge) {
      const spouseAgeAtYear = spouseAge + delta;
      return `${clientAgeAtYear}/${spouseAgeAtYear}`;
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Non-SSI Income</h4>
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4 mr-1" />
          Add Entry
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          No income entries. Click &quot;Add Entry&quot; to add annual income data.
        </p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Year</th>
                <th className="px-3 py-2 text-left font-medium">Age(s)</th>
                <th className="px-3 py-2 text-left font-medium">Gross Taxable</th>
                <th className="px-3 py-2 text-left font-medium">Tax Exempt</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <IncomeTableRow
                  key={field.id}
                  index={index}
                  onRemove={() => remove(index)}
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
  spouseAge: number | undefined;
  currentYear: number;
}

function IncomeTableRow({ index, onRemove, currentAge, spouseAge, currentYear }: IncomeTableRowProps) {
  const form = useFormContext<ClientFormData>();
  const removingRef = useRef(false);

  // Watch year for this row
  const rowYear = form.watch(`non_ssi_income.${index}.year`);
  const filingStatus = form.watch("filing_status");
  const isMarried = filingStatus === "married_filing_jointly";

  // Calculate display age
  const delta = (rowYear || currentYear) - currentYear;
  const cAge = currentAge + delta;
  const sAge = (isMarried && spouseAge) ? (spouseAge + delta) : null;
  const displayAge = sAge ? `${cAge}/${sAge}` : `${cAge}`;

  // Sync the calculated age to form state (only if not being removed)
  useEffect(() => {
    if (removingRef.current) return;
    const currentVal = form.getValues(`non_ssi_income.${index}.age`);
    if (currentVal !== displayAge) {
      form.setValue(`non_ssi_income.${index}.age`, displayAge);
    }
  }, [displayAge, index, form]);

  const handleRemove = () => {
    // Mark as removing to prevent useEffect from re-creating the entry
    removingRef.current = true;
    onRemove();
  };

  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <Input
          type="number"
          min={2024}
          max={2100}
          className="w-20 h-8"
          {...form.register(`non_ssi_income.${index}.year`, { valueAsNumber: true })}
        />
      </td>
      <td className="px-3 py-2">
        <div className="h-8 flex items-center px-3 bg-muted/20 rounded-sm text-muted-foreground font-mono text-xs">
          {displayAge}
        </div>
        <input type="hidden" {...form.register(`non_ssi_income.${index}.age`)} value={displayAge} />
      </td>
      <td className="px-3 py-2">
        <Controller
          name={`non_ssi_income.${index}.gross_taxable`}
          control={form.control}
          render={({ field: { ref, ...field } }) => (
            <CurrencyInput
              {...field}
              value={field.value ?? 0}
              onChange={(value) => field.onChange(value ?? 0)}
              className="w-32 h-8"
            />
          )}
        />
      </td>
      <td className="px-3 py-2">
        <Controller
          name={`non_ssi_income.${index}.tax_exempt`}
          control={form.control}
          render={({ field: { ref, ...field } }) => (
            <CurrencyInput
              {...field}
              value={field.value ?? 0}
              onChange={(value) => field.onChange(value ?? 0)}
              className="w-32 h-8"
            />
          )}
        />
      </td>
      <td className="px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
