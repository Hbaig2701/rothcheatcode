"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, Controller } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2, Repeat } from "lucide-react";

/**
 * Voluntary IRA / Roth withdrawal schedule.
 *
 * Mirrors IncomeTable's pattern (per-year rows + a "fill recurring" panel) but
 * with a `source` dropdown — 'auto' is the default and gives the natural
 * baseline-vs-strategy comparison: baseline naturally falls to IRA, the strategy
 * pulls from Roth (after conversions accumulate).
 */
const SOURCE_OPTIONS: Array<{ value: "auto" | "ira" | "roth"; label: string; help: string }> = [
  { value: "auto", label: "Auto (prefer Roth, fall back to IRA)", help: "Tax-free in strategy, taxable in baseline" },
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
  const [startAgeStr, setStartAgeStr] = useState(String(Math.max(currentAge, 70)));
  const [endAgeStr, setEndAgeStr] = useState(String(endAge));
  const [recurringAmount, setRecurringAmount] = useState<number | null>(null);
  const [recurringSource, setRecurringSource] = useState<"auto" | "ira" | "roth">("auto");
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const handleAddYear = () => {
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
      setRecurringError("Start age must be <= end age");
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
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Voluntary Withdrawals
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pull from IRA or Roth at specific ages. Reduces the projected balance and (for IRA) adds to taxable income — independent of RMDs and Roth conversions.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRecurring((s) => !s)}
          >
            <Repeat className="size-3.5" />
            {showRecurring ? "Cancel" : "Fill range"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleAddYear}>
            <Plus className="size-3.5" />
            Add year
          </Button>
        </div>
      </div>

      {showRecurring && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Fill ages with the same withdrawal
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[11px] uppercase text-muted-foreground tracking-wide">Start age</label>
              <Input type="number" value={startAgeStr} onChange={(e) => setStartAgeStr(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] uppercase text-muted-foreground tracking-wide">End age</label>
              <Input type="number" value={endAgeStr} onChange={(e) => setEndAgeStr(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] uppercase text-muted-foreground tracking-wide">Annual</label>
              <CurrencyInput value={recurringAmount} onChange={(v) => setRecurringAmount(v ?? null)} />
            </div>
            <div>
              <label className="text-[11px] uppercase text-muted-foreground tracking-wide">Source</label>
              <select
                value={recurringSource}
                onChange={(e) => setRecurringSource(e.target.value as "auto" | "ira" | "roth")}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          {recurringError && <div className="text-xs text-red-600">{recurringError}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowRecurring(false)}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleFillRecurring}>Apply (overwrites)</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Replaces the entire schedule with one row per age in the range.
          </p>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          No voluntary withdrawals scheduled. RMDs and conversions still apply.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[80px_60px_1fr_180px_36px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
            <div>Year</div>
            <div>Age</div>
            <div>Amount</div>
            <div>Source</div>
            <div></div>
          </div>
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="grid grid-cols-[80px_60px_1fr_180px_36px] gap-2 px-3 py-2 items-center border-b border-border last:border-0"
            >
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
                    className="h-8 text-sm"
                  />
                )}
              />
              <Controller
                control={form.control}
                name={`withdrawals.${idx}.age`}
                render={({ field: f }) => (
                  <Input
                    type="number"
                    value={typeof f.value === "number" ? f.value : ""}
                    readOnly
                    tabIndex={-1}
                    className="h-8 text-sm bg-muted/30"
                  />
                )}
              />
              <Controller
                control={form.control}
                name={`withdrawals.${idx}.amount`}
                render={({ field: f }) => (
                  <CurrencyInput value={f.value} onChange={f.onChange} />
                )}
              />
              <Controller
                control={form.control}
                name={`withdrawals.${idx}.source`}
                render={({ field: f }) => (
                  <select
                    value={f.value ?? "auto"}
                    onChange={(e) => f.onChange(e.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} title={opt.help}>
                        {opt.value === "auto" ? "Auto" : opt.value === "ira" ? "Traditional IRA" : "Roth IRA"}
                      </option>
                    ))}
                  </select>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(idx)}
                aria-label="Remove row"
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
