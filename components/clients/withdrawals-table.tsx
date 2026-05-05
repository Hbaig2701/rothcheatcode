"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, Controller } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2, Repeat, ChevronDown, ChevronRight } from "lucide-react";

/**
 * Voluntary IRA / Roth withdrawal schedule.
 *
 * Mirrors IncomeTable's layout (header + buttons, optional recurring panel,
 * proper <table> with horizontal scroll when narrow). Using a real table
 * matters because the input-sidebar / input-drawer apply a global
 * `[&_.grid]:!grid-cols-1` override that would collapse a CSS-grid layout
 * into stacked rows.
 */
const SOURCE_OPTIONS: Array<{ value: "auto" | "ira" | "roth"; label: string; help: string }> = [
  { value: "auto", label: "Auto", help: "Roth first (tax-free), IRA fallback — gives the natural baseline-vs-strategy comparison" },
  { value: "ira", label: "Traditional IRA", help: "Always taxable; 10% penalty if under 59½" },
  { value: "roth", label: "Roth IRA", help: "Tax-free (assumes qualified — 5-yr rule + 59½)" },
];

export function WithdrawalsTable() {
  const form = useFormContext<ClientFormData>();
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "withdrawals",
  });

  const currentAge = form.watch("age") || 62;
  const endAge = form.watch("end_age") || 95;
  const currentYear = new Date().getFullYear();

  const [showRecurring, setShowRecurring] = useState(false);
  // Collapse when there are a lot of rows — same UX pattern as Non-SSI Income.
  const [collapsed, setCollapsed] = useState(() => fields.length >= 6);

  const [startAgeStr, setStartAgeStr] = useState(String(Math.max(currentAge, 70)));
  const [endAgeStr, setEndAgeStr] = useState(String(endAge));
  const [recurringAmount, setRecurringAmount] = useState<number | null>(null);
  const [recurringSource, setRecurringSource] = useState<"auto" | "ira" | "roth">("auto");
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const handleAddYear = () => {
    setCollapsed(false); // auto-expand so the new row lands in view
    const lastEntry = fields.length > 0 ? form.getValues(`withdrawals.${fields.length - 1}`) : null;
    const nextYear = lastEntry ? lastEntry.year + 1 : currentYear;
    const nextAge = currentAge + (nextYear - currentYear);
    append({
      year: nextYear,
      age: nextAge,
      amount: lastEntry?.amount ?? 0,
      source: lastEntry?.source ?? "auto",
    });
  };

  const handleFillRecurring = () => {
    setRecurringError(null);
    const startAge = parseInt(startAgeStr, 10);
    const stopAge = parseInt(endAgeStr, 10);
    if (Number.isNaN(startAge) || Number.isNaN(stopAge)) {
      setRecurringError("Both start and end ages are required");
      return;
    }
    if (startAge > stopAge) {
      setRecurringError("Start age must be ≤ end age");
      return;
    }
    if (recurringAmount == null || recurringAmount <= 0) {
      setRecurringError("Annual amount must be greater than zero");
      return;
    }
    const rows = [];
    for (let a = startAge; a <= stopAge; a++) {
      rows.push({
        year: currentYear + (a - currentAge),
        age: a,
        amount: recurringAmount,
        source: recurringSource,
      });
    }
    replace(rows);
    setShowRecurring(false);
    setCollapsed(false);
  };

  const collapsedSummary = (() => {
    if (fields.length === 0) return null;
    const years = fields
      .map((_, i) => form.getValues(`withdrawals.${i}.year`))
      .filter((y): y is number => typeof y === "number" && !Number.isNaN(y))
      .sort((a, b) => a - b);
    const count = fields.length;
    const range = years.length > 0
      ? years[0] === years[years.length - 1]
        ? `${years[0]}`
        : `${years[0]}–${years[years.length - 1]}`
      : null;
    return `${count} ${count === 1 ? "entry" : "entries"}${range ? ` · ${range}` : ""}`;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors -ml-1 px-1 py-0.5 rounded"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="whitespace-nowrap">Withdrawal Schedule</span>
          {collapsed && collapsedSummary && (
            <span className="text-xs font-normal text-muted-foreground ml-1.5">
              ({collapsedSummary})
            </span>
          )}
        </button>
        <div className="flex flex-wrap gap-2">
          {fields.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Delete all ${fields.length} withdrawal ${fields.length === 1 ? "entry" : "entries"}?`)) {
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
            onClick={() => setShowRecurring((s) => !s)}
            className={showRecurring ? "border-primary text-primary" : ""}
          >
            <Repeat className="h-4 w-4 mr-1" />
            Recurring
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleAddYear}>
            <Plus className="h-4 w-4 mr-1" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Recurring fill panel — visible regardless of collapsed state so
          advisors can bulk-fill without expanding first. */}
      {showRecurring && (
        <div className="border border-primary/30 bg-accent rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-1">
          <p className="text-sm font-medium">Fill range with the same withdrawal</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">Start age</label>
              <Input type="number" value={startAgeStr} onChange={(e) => setStartAgeStr(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">End age</label>
              <Input type="number" value={endAgeStr} onChange={(e) => setEndAgeStr(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">Annual amount</label>
              <CurrencyInput value={recurringAmount} onChange={(v) => setRecurringAmount(v ?? null)} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">Source</label>
              <select
                value={recurringSource}
                onChange={(e) => setRecurringSource(e.target.value as "auto" | "ira" | "roth")}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          {recurringError && <p className="text-xs text-red-600">{recurringError}</p>}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleFillRecurring}
              className="bg-gold hover:bg-primary/90 text-primary-foreground"
            >
              Fill (overwrites schedule)
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowRecurring(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!collapsed && (
        <div>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
              No voluntary withdrawals scheduled. RMDs and conversions still apply.
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="text-sm min-w-full" style={{ minWidth: "560px" }}>
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-[100px]">Year</th>
                    <th className="px-3 py-2 text-left font-medium w-[80px]">Age</th>
                    <th className="px-3 py-2 text-left font-medium">Amount</th>
                    <th className="px-3 py-2 text-left font-medium w-[180px]">Source</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, idx) => (
                    <tr key={field.id} className="border-t">
                      <td className="px-3 py-2 align-top">
                        <Controller
                          control={form.control}
                          name={`withdrawals.${idx}.year`}
                          render={({ field: f }) => (
                            <Input
                              type="number"
                              value={f.value ?? ""}
                              onChange={(e) => {
                                const yr = parseInt(e.target.value, 10);
                                f.onChange(Number.isFinite(yr) ? yr : null);
                                if (Number.isFinite(yr)) {
                                  form.setValue(`withdrawals.${idx}.age`, currentAge + (yr - currentYear));
                                }
                              }}
                              // Hide native number spinners — they steal ~17px
                              // of content width and were truncating "2026".
                              className="h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          )}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Controller
                          control={form.control}
                          name={`withdrawals.${idx}.age`}
                          render={({ field: f }) => (
                            <Input
                              type="number"
                              value={typeof f.value === "number" ? f.value : ""}
                              readOnly
                              tabIndex={-1}
                              className="h-9 bg-muted/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          )}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Controller
                          control={form.control}
                          name={`withdrawals.${idx}.amount`}
                          render={({ field: f }) => (
                            <CurrencyInput value={f.value} onChange={f.onChange} />
                          )}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Controller
                          control={form.control}
                          name={`withdrawals.${idx}.source`}
                          render={({ field: f }) => (
                            <select
                              value={f.value ?? "auto"}
                              onChange={(e) => f.onChange(e.target.value)}
                              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                            >
                              {SOURCE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} title={opt.help}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            const currentIdx = fields.findIndex((row) => row.id === field.id);
                            remove(currentIdx >= 0 ? currentIdx : idx);
                          }}
                          aria-label="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
