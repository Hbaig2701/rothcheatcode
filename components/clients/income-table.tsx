"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2 } from "lucide-react";

export function IncomeTable() {
  const form = useFormContext<ClientFormData>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "non_ssi_income",
  });

  const currentAge = form.watch("age") || 62;
  const currentYear = new Date().getFullYear();

  const addEntry = () => {
    // Calculate next year and age based on existing entries
    const lastEntry = fields[fields.length - 1];
    const nextYear = lastEntry
      ? (form.getValues(`non_ssi_income.${fields.length - 1}.year`) || currentYear) + 1
      : currentYear;
    const nextAge = lastEntry
      ? (form.getValues(`non_ssi_income.${fields.length - 1}.age`) || currentAge) + 1
      : currentAge;

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
                <th className="px-3 py-2 text-left font-medium">Age</th>
                <th className="px-3 py-2 text-left font-medium">Gross Taxable</th>
                <th className="px-3 py-2 text-left font-medium">Tax Exempt</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t">
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
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      className="w-16 h-8"
                      {...form.register(`non_ssi_income.${index}.age`, { valueAsNumber: true })}
                    />
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
