"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";

export function IncomeTable() {
  const form = useFormContext<ClientFormData>();
  const { fields, append, remove, update } = useFieldArray({
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
              {fields.map((field, index) => {
                // We need to watch the year to update display if user edits year
                // However, calling watch inside map is bad for perf if list is long, 
                // but list is usually short (<10 rows).
                // Use Controller or watch at component level?
                // Let's just rely on field.year initially, and if edited, we update.
                // Actually, to display dynamic updates, we need to watch.
                // Ideally use a row component. But for simplicity:

                return (
                  <IncomeTableRow
                    key={field.id}
                    index={index}
                    remove={remove}
                    currentAge={currentAge}
                    spouseAge={spouseAge}
                    currentYear={currentYear}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IncomeTableRow({ index, remove, currentAge, spouseAge, currentYear }: any) {
  const form = useFormContext<ClientFormData>();
  // Watch year for this row
  const rowYear = form.watch(`non_ssi_income.${index}.year`);
  const filingStatus = form.watch("filing_status");
  const isMarried = filingStatus === "married_filing_jointly";

  // Calculate display age
  const delta = (rowYear || currentYear) - currentYear;
  const cAge = currentAge + delta;
  const sAge = (isMarried && spouseAge) ? (spouseAge + delta) : null;
  const displayAge = sAge ? `${cAge}/${sAge}` : `${cAge}`;

  // Sync the form value `age` whenever `rowYear` or global ages change?
  // We can use a hidden input with value={displayAge}.
  // But we need to register it.

  useEffect(() => {
    // Keep the form state 'age' in sync with the calculated one
    // This ensures submit gets the correct string
    const currentVal = form.getValues(`non_ssi_income.${index}.age`);
    if (currentVal !== displayAge) {
      form.setValue(`non_ssi_income.${index}.age`, displayAge);
    }
  }, [displayAge, index, form]);

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
        {/* Read Only Display */}
        <div className="h-8 flex items-center px-3 bg-muted/20 rounded-sm text-muted-foreground font-mono text-xs">
          {displayAge}
        </div>
        {/* Hidden input to persist value */}
        <input type="hidden" {...form.register(`non_ssi_income.${index}.age`)} value={displayAge} />
      </td>
      <td className="px-3 py-2">
        <CurrencyInput
          value={form.watch(`non_ssi_income.${index}.gross_taxable`) ?? 0}
          onChange={(value) => form.setValue(`non_ssi_income.${index}.gross_taxable`, value ?? 0)}
          className="w-32 h-8"
        />
      </td>
      <td className="px-3 py-2">
        <CurrencyInput
          value={form.watch(`non_ssi_income.${index}.tax_exempt`) ?? 0}
          onChange={(value) => form.setValue(`non_ssi_income.${index}.tax_exempt`, value ?? 0)}
          className="w-32 h-8"
        />
      </td>
      <td className="px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => remove(index)}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
