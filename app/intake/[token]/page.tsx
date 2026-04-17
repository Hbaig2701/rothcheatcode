"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { US_STATES } from "@/lib/data/states";
import { INCOME_TYPES, type IncomeType } from "@/lib/types/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle, Plus, Trash2 } from "lucide-react";

type IncomeEntry = {
  type: IncomeType;
  annual_amount: string;
  start_age: string;
  end_age: string;
};

type FormData = {
  name: string;
  age: string;
  filing_status: "single" | "married_filing_jointly";
  spouse_name: string;
  spouse_age: string;
  state: string;
  qualified_account_value: string;
  roth_ira: string;
  taxable_accounts: string;
  ssi_payout_age: string;
  ssi_annual_amount: string;
  spouse_ssi_payout_age: string;
  spouse_ssi_annual_amount: string;
  other_income_notes: string;
  income_entries: IncomeEntry[];
};

const initialForm: FormData = {
  name: "",
  age: "",
  filing_status: "single",
  spouse_name: "",
  spouse_age: "",
  state: "",
  qualified_account_value: "",
  roth_ira: "",
  taxable_accounts: "",
  // Pre-fill SSI start ages with the most common value (67 = Full Retirement
  // Age for most people). This avoids users mistaking the placeholder for an
  // entered value and submitting 0, which fails the >=62 validation.
  ssi_payout_age: "67",
  ssi_annual_amount: "",
  spouse_ssi_payout_age: "67",
  spouse_ssi_annual_amount: "",
  other_income_notes: "",
  income_entries: [],
};

export default function IntakeFormPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "valid" | "error" | "submitted">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [branding, setBranding] = useState<{ logoUrl: string | null; companyName: string | null }>({
    logoUrl: null,
    companyName: null,
  });

  const isMarried = form.filing_status === "married_filing_jointly";

  useEffect(() => {
    fetch(`/api/intake/${token}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setStatus("valid");
          if (data.branding) {
            setBranding(data.branding);
          }
        } else {
          setStatus("error");
          setErrorMessage(data.error || "This link is no longer valid.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMessage("Unable to validate this link. Please try again.");
      });
  }, [token]);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const clearIncomeErrors = () => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith("income_")) delete next[key];
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});

    // Client-side required-field checks so users see "This field is required"
    // instead of cryptic Zod range errors when a field is empty.
    const requiredErrors: Record<string, string> = {};
    if (!form.name.trim()) requiredErrors.name = "Name is required";
    if (!form.age) requiredErrors.age = "Age is required";
    if (!form.state) requiredErrors.state = "State is required";
    if (!form.qualified_account_value) requiredErrors.qualified_account_value = "Account value is required";
    if (!form.ssi_payout_age) requiredErrors.ssi_payout_age = "SSI start age is required";
    if (!form.ssi_annual_amount) requiredErrors.ssi_annual_amount = "SSI annual amount is required";
    if (isMarried) {
      if (!form.spouse_name.trim()) requiredErrors.spouse_name = "Spouse name is required";
      if (!form.spouse_age) requiredErrors.spouse_age = "Spouse age is required";
    }
    // Validate income entries
    for (let i = 0; i < form.income_entries.length; i++) {
      const entry = form.income_entries[i];
      const label = INCOME_TYPES.find((t) => t.value === entry.type)?.label ?? `Income #${i + 1}`;
      if (!entry.annual_amount || parseFloat(entry.annual_amount.replace(/,/g, "")) <= 0) {
        requiredErrors[`income_${i}`] = `${label}: Annual amount is required`;
      }
      if (!entry.start_age) {
        requiredErrors[`income_${i}_start`] = `${label}: Start age is required`;
      }
      if (!entry.end_age) {
        requiredErrors[`income_${i}_end`] = `${label}: End age is required`;
      }
      if (entry.start_age && entry.end_age && parseInt(entry.start_age) > parseInt(entry.end_age)) {
        requiredErrors[`income_${i}_range`] = `${label}: Start age must be before end age`;
      }
    }

    if (Object.keys(requiredErrors).length > 0) {
      setFieldErrors(requiredErrors);
      setSubmitting(false);
      return;
    }

    // Build submission payload (convert strings to numbers, dollars to raw numbers)
    // Convert structured income entries into non_ssi_income array (year-by-year with type)
    const clientAge = parseInt(form.age) || 0;
    const thisYear = new Date().getFullYear();
    const incomeEntries: Array<{ year: number; age: string; gross_taxable: number; tax_exempt: number; type: string }> = [];
    for (const entry of form.income_entries) {
      const amount = Math.round((parseFloat(entry.annual_amount.replace(/,/g, "")) || 0) * 100);
      const startAge = parseInt(entry.start_age) || clientAge;
      const endAge = parseInt(entry.end_age) || 95;
      if (amount <= 0) continue;
      for (let age = startAge; age <= endAge; age++) {
        const year = thisYear + (age - clientAge);
        const existing = incomeEntries.find((e) => e.year === year && e.type === entry.type);
        if (existing) {
          existing.gross_taxable += amount;
        } else {
          incomeEntries.push({
            year,
            age: String(age),
            gross_taxable: amount,
            tax_exempt: 0,
            type: entry.type,
          });
        }
      }
    }
    incomeEntries.sort((a, b) => a.year - b.year);

    const payload = {
      name: form.name.trim(),
      age: parseInt(form.age) || 0,
      filing_status: form.filing_status,
      spouse_name: isMarried ? form.spouse_name.trim() : undefined,
      spouse_age: isMarried && form.spouse_age ? parseInt(form.spouse_age) : undefined,
      state: form.state,
      qualified_account_value: parseFloat(form.qualified_account_value.replace(/,/g, "")) || 0,
      roth_ira: parseFloat(form.roth_ira.replace(/,/g, "")) || 0,
      taxable_accounts: parseFloat(form.taxable_accounts.replace(/,/g, "")) || 0,
      ssi_payout_age: parseInt(form.ssi_payout_age) || 0,
      ssi_annual_amount: parseFloat(form.ssi_annual_amount.replace(/,/g, "")) || 0,
      spouse_ssi_payout_age: isMarried && form.spouse_ssi_payout_age ? parseInt(form.spouse_ssi_payout_age) : undefined,
      spouse_ssi_annual_amount: isMarried && form.spouse_ssi_annual_amount ? parseFloat(form.spouse_ssi_annual_amount.replace(/,/g, "")) : undefined,
      other_income_notes: form.other_income_notes.trim() || undefined,
      non_ssi_income: incomeEntries.length > 0 ? incomeEntries : undefined,
    };

    try {
      const res = await fetch(`/api/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus("submitted");
      } else if (data.details?.fieldErrors) {
        const errors: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(data.details.fieldErrors)) {
          if (Array.isArray(msgs) && msgs.length > 0) {
            errors[key] = msgs[0] as string;
          }
        }
        setFieldErrors(errors);
      } else {
        setFieldErrors({ _form: data.error || "Something went wrong. Please try again." });
      }
    } catch {
      setFieldErrors({ _form: "Network error. Please check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state (expired, completed, invalid)
  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-red mx-auto" />
          <h1 className="text-2xl font-display font-semibold text-foreground">
            Questionnaire Unavailable
          </h1>
          <p className="text-muted-foreground">{errorMessage}</p>
          <p className="text-sm text-text-dimmer">
            Please contact your financial advisor for a new link.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (status === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green mx-auto" />
          <h1 className="text-2xl font-display font-semibold text-foreground">
            Thank You!
          </h1>
          <p className="text-muted-foreground">
            Your information has been submitted successfully. Your financial advisor will review it and follow up with you shortly.
          </p>
        </div>
      </div>
    );
  }

  // Form
  return (
    <div className="min-h-screen py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={branding.companyName ?? ""}
              className="h-12 w-auto mx-auto mb-6"
            />
          )}
          <h1 className="text-3xl font-display font-semibold text-foreground">
            Client Questionnaire
          </h1>
          <p className="text-muted-foreground mt-2">
            Please fill out the information below. Your financial advisor will use this to prepare your retirement analysis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Global error */}
          {fieldErrors._form && (
            <div className="rounded-xl border border-red/20 bg-red-bg p-4">
              <p className="text-sm text-red">{fieldErrors._form}</p>
            </div>
          )}

          {/* Section 1: Personal Information */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">Personal Information</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="Full Name" error={fieldErrors.name} required>
                <Input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="John Smith"
                />
              </FieldGroup>

              <FieldGroup label="Age" error={fieldErrors.age} required>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.age}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                    updateField("age", v);
                  }}
                  placeholder="Enter age"
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Filing Status" error={fieldErrors.filing_status} required>
              <select
                value={form.filing_status}
                onChange={(e) => updateField("filing_status", e.target.value as "single" | "married_filing_jointly")}
                className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm text-foreground"
              >
                <option value="single">Single</option>
                <option value="married_filing_jointly">Married Filing Jointly</option>
              </select>
            </FieldGroup>

            {isMarried && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <FieldGroup label="Spouse Name" error={fieldErrors.spouse_name} required>
                  <Input
                    value={form.spouse_name}
                    onChange={(e) => updateField("spouse_name", e.target.value)}
                    placeholder="Jane Smith"
                  />
                </FieldGroup>
                <FieldGroup label="Spouse Age" error={fieldErrors.spouse_age} required>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.spouse_age}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                      updateField("spouse_age", v);
                    }}
                    placeholder="Enter age"
                  />
                </FieldGroup>
              </div>
            )}

            <FieldGroup label="State" error={fieldErrors.state} required>
              <select
                value={form.state}
                onChange={(e) => updateField("state", e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2.5 text-sm text-foreground"
              >
                <option value="">Select your state</option>
                {[...US_STATES]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </FieldGroup>
          </section>

          {/* Section 2: Account Balances */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">Account Balances</h2>
            <p className="text-sm text-muted-foreground -mt-2">
              Enter approximate current balances. Your advisor can adjust these later.
            </p>

            <FieldGroup label="Qualified Account Value (IRA, 401k, etc.)" error={fieldErrors.qualified_account_value} required>
              <DollarInput
                value={form.qualified_account_value}
                onChange={(v) => updateField("qualified_account_value", v)}
                placeholder="500,000"
              />
            </FieldGroup>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="Roth IRA Balance" error={fieldErrors.roth_ira}>
                <DollarInput
                  value={form.roth_ira}
                  onChange={(v) => updateField("roth_ira", v)}
                  placeholder="0"
                />
              </FieldGroup>

              <FieldGroup label="Taxable Account Balance" error={fieldErrors.taxable_accounts}>
                <DollarInput
                  value={form.taxable_accounts}
                  onChange={(v) => updateField("taxable_accounts", v)}
                  placeholder="0"
                />
              </FieldGroup>
            </div>
          </section>

          {/* Section 3: Social Security */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">Social Security</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label="Expected SSI Start Age" error={fieldErrors.ssi_payout_age} required>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.ssi_payout_age}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                    updateField("ssi_payout_age", v);
                  }}
                  placeholder="62–70"
                />
                <p className="text-xs text-muted-foreground mt-1">Between 62 and 70</p>
              </FieldGroup>

              <FieldGroup label="Expected Annual SSI Amount" error={fieldErrors.ssi_annual_amount} required>
                <DollarInput
                  value={form.ssi_annual_amount}
                  onChange={(v) => updateField("ssi_annual_amount", v)}
                  placeholder="24,000"
                />
              </FieldGroup>
            </div>

            {isMarried && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <FieldGroup label="Spouse SSI Start Age" error={fieldErrors.spouse_ssi_payout_age}>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.spouse_ssi_payout_age}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                      updateField("spouse_ssi_payout_age", v);
                    }}
                    placeholder="62–70"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Between 62 and 70</p>
                </FieldGroup>

                <FieldGroup label="Spouse Annual SSI Amount" error={fieldErrors.spouse_ssi_annual_amount}>
                  <DollarInput
                    value={form.spouse_ssi_annual_amount}
                    onChange={(v) => updateField("spouse_ssi_annual_amount", v)}
                    placeholder="18,000"
                  />
                </FieldGroup>
              </div>
            )}
          </section>

          {/* Section 4: Other Income */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Other Income</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Add any non-Social Security income sources — pension, rental income, dividends, etc.
                </p>
              </div>
              {form.income_entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => { setForm((prev) => ({ ...prev, income_entries: [] })); clearIncomeErrors(); }}
                  className="text-xs text-muted-foreground hover:text-red transition-colors"
                >
                  Remove All
                </button>
              )}
            </div>

            {/* Show any income entry validation errors */}
            {Object.entries(fieldErrors)
              .filter(([k]) => k.startsWith("income_"))
              .map(([k, v]) => (
                <p key={k} className="text-xs text-red">{v}</p>
              ))}

            {form.income_entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                No income entries. Click &quot;Add Income&quot; below to add a source.
              </p>
            ) : (
              <div className="space-y-3">
                {form.income_entries.map((entry, idx) => (
                  <div key={idx} className="border border-border rounded-xl p-4 space-y-3 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {INCOME_TYPES.find((t) => t.value === entry.type)?.label ?? "Other"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = form.income_entries.filter((_, i) => i !== idx);
                          setForm((prev) => ({ ...prev, income_entries: next }));
                          clearIncomeErrors();
                        }}
                        className="p-1 text-muted-foreground hover:text-red rounded hover:bg-red-bg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Type</label>
                        <select
                          value={entry.type}
                          onChange={(e) => {
                            const next = [...form.income_entries];
                            next[idx] = { ...next[idx], type: e.target.value as IncomeType };
                            setForm((prev) => ({ ...prev, income_entries: next }));
                            clearIncomeErrors();
                          }}
                          className="w-full h-9 rounded-md border border-border bg-white dark:bg-input/30 px-2 text-sm text-foreground"
                        >
                          {INCOME_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Annual Amount</label>
                        <DollarInput
                          value={entry.annual_amount}
                          onChange={(v) => {
                            const next = [...form.income_entries];
                            next[idx] = { ...next[idx], annual_amount: v };
                            setForm((prev) => ({ ...prev, income_entries: next }));
                            clearIncomeErrors();
                          }}
                          placeholder="50,000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Start Age</label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={entry.start_age}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                            const next = [...form.income_entries];
                            next[idx] = { ...next[idx], start_age: v };
                            setForm((prev) => ({ ...prev, income_entries: next }));
                            clearIncomeErrors();
                          }}
                          placeholder="Enter age"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">End Age</label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={entry.end_age}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                            const next = [...form.income_entries];
                            next[idx] = { ...next[idx], end_age: v };
                            setForm((prev) => ({ ...prev, income_entries: next }));
                            clearIncomeErrors();
                          }}
                          placeholder="Enter age"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setForm((prev) => ({
                  ...prev,
                  income_entries: [
                    ...prev.income_entries,
                    { type: "pension" as IncomeType, annual_amount: "", start_age: "", end_age: "95" },
                  ],
                }));
              }}
              className="w-full h-10 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground bg-transparent border border-dashed border-border rounded-xl hover:bg-accent hover:border-border transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Income
            </button>
          </section>

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-gold hover:bg-primary/90 text-primary-foreground font-semibold text-base rounded-xl"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              "Submit Questionnaire"
            )}
          </Button>

          <p className="text-xs text-text-dimmer text-center">
            Your information is securely transmitted to your financial advisor.
          </p>
        </form>
      </div>
    </div>
  );
}

// Helper components

function FieldGroup({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-red ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}

function formatWithCommas(raw: string): string {
  if (!raw) return "";
  // Strip existing commas, split on decimal
  const stripped = raw.replace(/,/g, "");
  const parts = stripped.split(".");
  // Add commas to integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function DollarInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything except digits and decimal point
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    // Only allow one decimal point, max 2 decimal places
    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
      onChange(formatWithCommas(raw));
    }
  };

  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="pl-7"
      />
    </div>
  );
}
