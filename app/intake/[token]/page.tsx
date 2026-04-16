"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { US_STATES } from "@/lib/data/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});

    // Build submission payload (convert strings to numbers, dollars to raw numbers)
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
                  placeholder="62"
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
                    placeholder="60"
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
                {US_STATES.map((s) => (
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
                  placeholder="67"
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
                    placeholder="67"
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
            <h2 className="text-lg font-semibold text-foreground">Other Income</h2>
            <p className="text-sm text-muted-foreground -mt-2">
              Describe any other income sources (pension, rental income, part-time work, etc.)
            </p>

            <FieldGroup label="Other Income Details" error={fieldErrors.other_income_notes}>
              <textarea
                value={form.other_income_notes}
                onChange={(e) => updateField("other_income_notes", e.target.value)}
                placeholder="e.g., Pension of $12,000/year starting at age 65, rental income of $800/month..."
                rows={3}
                className="w-full rounded-md border border-border bg-white dark:bg-input/30 px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none"
                maxLength={1000}
              />
            </FieldGroup>
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
