# Phase 03: Client Data Entry Form - Research

**Researched:** 2026-01-18
**Domain:** React Hook Form, Zod validation, shadcn/ui forms, currency/percent inputs, US state tax data
**Confidence:** HIGH

## Summary

This phase implements a comprehensive 28-field client data entry form using the existing shadcn/ui components with React Hook Form and Zod validation. The project already has the core libraries installed (react-hook-form, @hookform/resolvers, zod) and Phase 02 established the basic CRUD patterns.

The standard approach is:
1. **Form State**: React Hook Form with zodResolver for validation
2. **UI Components**: shadcn/ui Field components with existing Input, Select, Combobox
3. **Custom Inputs**: Build CurrencyInput and PercentInput components wrapping react-currency-input-field
4. **Conditional Fields**: Use watch() to show/hide spouse fields based on filing status
5. **Smart Defaults**: Static JSON lookup for state tax rates; compute life expectancy from actuarial tables

**Primary recommendation:** Extend the existing Zod schema in `lib/validations/client.ts` to all 28 fields, create reusable FormField wrapper components, and build currency/percent inputs that integrate with Controller.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `react-hook-form` | ^7.71.1 | Form state management | Installed |
| `@hookform/resolvers` | ^5.2.2 | Zod integration | Installed |
| `zod` | ^4.3.5 | Schema validation | Installed (v4!) |
| `@base-ui/react` | ^1.1.0 | UI primitives | Installed |

### Required (Must Install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-currency-input-field` | ^4.0.3 | Currency/percent formatting | 315K weekly downloads, maintained, supports prefix/suffix |

### Supporting (Optional)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-number-format` | ^5.x | Alternative to currency input | If react-currency-input-field doesn't meet needs |

**Installation:**
```bash
npm install react-currency-input-field
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── validations/
│   └── client.ts              # Expanded Zod schema (all 28 fields)
├── data/
│   ├── states.ts              # US states list with tax rates
│   ├── federal-brackets.ts    # Federal tax bracket data
│   └── actuarial.ts           # Life expectancy tables
├── types/
│   └── client.ts              # Updated Client interface (all fields)
components/
├── ui/
│   ├── currency-input.tsx     # CurrencyInput component
│   ├── percent-input.tsx      # PercentInput component
│   └── form-field.tsx         # Reusable FormField wrapper (optional)
├── clients/
│   ├── client-form.tsx        # Main 28-field form
│   ├── sections/
│   │   ├── personal-info.tsx  # Personal section (6 fields)
│   │   ├── account-balances.tsx # Accounts section (4 fields)
│   │   ├── tax-config.tsx     # Tax section (4 fields)
│   │   ├── income-sources.tsx # Income section (5 fields)
│   │   ├── conversion.tsx     # Conversion section (4 fields)
│   │   └── advanced.tsx       # Advanced section (5 fields)
│   └── form-section.tsx       # Section header component
```

### Pattern 1: Zod v4 Schema with All Fields
**What:** Complete validation schema for 28 fields with smart defaults
**When to use:** Form validation and type inference
**Example:**
```typescript
// lib/validations/client.ts
import { z } from "zod";

// Filing status enum
const filingStatusEnum = z.enum([
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household"
]);

// Conversion strategy enum
const strategyEnum = z.enum([
  "conservative",
  "moderate",
  "aggressive",
  "irmaa_safe",
  "custom"
]);

// Tax payment source enum
const taxSourceEnum = z.enum(["from_ira", "from_taxable"]);

export const clientSchema = z.object({
  // Personal Information (6 fields)
  name: z.string().min(1, { error: "Name is required" }).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD format" }),
  state: z.string().length(2, { error: "Use 2-letter state code" }),
  filing_status: filingStatusEnum.default("married_filing_jointly"),
  spouse_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  life_expectancy: z.number().int().min(1).max(120).optional().nullable(),

  // Account Balances (4 fields) - stored as cents (integers)
  traditional_ira: z.number().int().min(0, { error: "Amount must be positive" }),
  roth_ira: z.number().int().min(0).default(0),
  taxable_accounts: z.number().int().min(0).default(0),
  other_retirement: z.number().int().min(0).default(0),

  // Tax Configuration (4 fields)
  federal_bracket: z.string(), // "auto" or specific bracket
  state_tax_rate: z.number().min(0).max(100).optional().nullable(), // null = auto
  include_niit: z.boolean().default(true),
  include_aca: z.boolean().default(false),

  // Income Sources (5 fields) - stored as cents
  ss_self: z.number().int().min(0).default(0),
  ss_spouse: z.number().int().min(0).default(0),
  pension: z.number().int().min(0).default(0),
  other_income: z.number().int().min(0).default(0),
  ss_start_age: z.number().int().min(62).max(70).default(67),

  // Conversion Settings (4 fields)
  strategy: strategyEnum.default("moderate"),
  start_age: z.number().int().min(50).max(90),
  end_age: z.number().int().min(55).max(95).default(75),
  tax_payment_source: taxSourceEnum.default("from_taxable"),

  // Advanced Options (5 fields)
  growth_rate: z.number().min(0).max(20).default(6),
  inflation_rate: z.number().min(0).max(10).default(2.5),
  heir_bracket: z.string().default("32"),
  projection_years: z.number().int().min(10).max(60).default(40),
  widow_analysis: z.boolean().default(false),
  sensitivity: z.boolean().default(false),
}).superRefine((data, ctx) => {
  // Spouse DOB required if married
  if (data.filing_status.includes("married") && !data.spouse_dob) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Spouse date of birth required for married filing",
      path: ["spouse_dob"],
    });
  }
  // End age must be greater than start age
  if (data.end_age <= data.start_age) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End age must be greater than start age",
      path: ["end_age"],
    });
  }
});

export type ClientFormData = z.infer<typeof clientSchema>;
```

### Pattern 2: CurrencyInput Component with React Hook Form
**What:** Formatted currency input that stores value in cents
**When to use:** All monetary fields (IRA, income, etc.)
**Example:**
```typescript
// components/ui/currency-input.tsx
"use client";

import { forwardRef } from "react";
import CurrencyInputField from "react-currency-input-field";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

interface CurrencyInputProps {
  value: number | undefined; // value in cents
  onChange: (cents: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, placeholder = "0", disabled, className, ...props }, ref) => {
    // Convert cents to dollars for display
    const displayValue = value !== undefined ? (value / 100).toString() : "";

    return (
      <InputGroup className={cn("w-full", className)}>
        <InputGroupAddon align="inline-start">$</InputGroupAddon>
        <CurrencyInputField
          customInput={InputGroupInput}
          ref={ref}
          value={displayValue}
          decimalsLimit={2}
          decimalScale={2}
          groupSeparator=","
          decimalSeparator="."
          placeholder={placeholder}
          disabled={disabled}
          onValueChange={(value, _, values) => {
            // Convert dollars to cents
            if (values?.float !== undefined && values.float !== null) {
              onChange(Math.round(values.float * 100));
            } else {
              onChange(undefined);
            }
          }}
          aria-invalid={props["aria-invalid"]}
        />
      </InputGroup>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";
```

### Pattern 3: PercentInput Component
**What:** Formatted percentage input
**When to use:** Growth rate, inflation rate fields
**Example:**
```typescript
// components/ui/percent-input.tsx
"use client";

import { forwardRef } from "react";
import CurrencyInputField from "react-currency-input-field";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

interface PercentInputProps {
  value: number | undefined; // value as percentage (e.g., 6 for 6%)
  onChange: (percent: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}

export const PercentInput = forwardRef<HTMLInputElement, PercentInputProps>(
  ({ value, onChange, placeholder = "0", disabled, className, ...props }, ref) => {
    return (
      <InputGroup className={cn("w-full", className)}>
        <CurrencyInputField
          customInput={InputGroupInput}
          ref={ref}
          value={value?.toString() ?? ""}
          decimalsLimit={2}
          decimalScale={1}
          groupSeparator=""
          decimalSeparator="."
          placeholder={placeholder}
          disabled={disabled}
          onValueChange={(_, __, values) => {
            if (values?.float !== undefined && values.float !== null) {
              onChange(values.float);
            } else {
              onChange(undefined);
            }
          }}
          aria-invalid={props["aria-invalid"]}
        />
        <InputGroupAddon align="inline-end">%</InputGroupAddon>
      </InputGroup>
    );
  }
);
PercentInput.displayName = "PercentInput";
```

### Pattern 4: Using Controller with Custom Inputs
**What:** Integrating custom inputs with React Hook Form
**When to use:** Any non-native input component
**Example:**
```typescript
// In client-form.tsx
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientSchema, type ClientFormData } from "@/lib/validations/client";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { CurrencyInput } from "@/components/ui/currency-input";

export function ClientForm() {
  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      traditional_ira: 0,
      roth_ira: 0,
      // ... other defaults
    },
  });

  return (
    <Controller
      name="traditional_ira"
      control={form.control}
      render={({ field: { ref, ...field }, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor="traditional_ira">Traditional IRA</FieldLabel>
          <CurrencyInput
            {...field}
            aria-invalid={fieldState.invalid}
          />
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}
```

### Pattern 5: Conditional Fields with watch()
**What:** Showing spouse DOB only when married
**When to use:** Fields that depend on other field values
**Example:**
```typescript
// In PersonalInfoSection
const filingStatus = form.watch("filing_status");
const isMarried = filingStatus?.includes("married");

return (
  <>
    {/* ... other fields ... */}

    {isMarried && (
      <Controller
        name="spouse_dob"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="spouse_dob">Spouse Date of Birth</FieldLabel>
            <Input
              type="date"
              {...field}
              value={field.value ?? ""}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    )}
  </>
);
```

### Pattern 6: FormSection Header Component
**What:** Consistent section headers for the 6 form sections
**When to use:** Visual separation between form sections
**Example:**
```typescript
// components/clients/form-section.tsx
interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}
```

### Anti-Patterns to Avoid
- **Storing currency as floats:** Use integers (cents) to avoid floating-point precision issues
- **Not using Controller for custom inputs:** Custom components need Controller, not register()
- **Recreating form context in each section:** Pass form.control down, or use useFormContext()
- **Validating on every keystroke:** Default RHF behavior validates on blur/submit, keep it
- **Not handling undefined in currency inputs:** The onValueChange callback may return undefined

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Currency formatting | Custom regex/mask | react-currency-input-field | Handles locales, edge cases, mobile keyboards |
| Form state | useState for each field | React Hook Form | Performance, validation, error states |
| Schema validation | if/else validation | Zod schema | Type inference, composable, Zod v4 performance |
| State tax data | Manual research | Static JSON from Tax Foundation | Authoritative, updated annually |
| Life expectancy | Manual lookup | Actuarial table JSON | IRS/SSA tables are standard |

**Key insight:** Currency inputs have many edge cases (negative numbers, paste handling, mobile keyboards, decimals). The react-currency-input-field library handles these; custom solutions will have bugs.

## Common Pitfalls

### Pitfall 1: Zod v4 Breaking Changes
**What goes wrong:** Schema validation behaves unexpectedly
**Why it happens:** Project uses Zod v4 (^4.3.5), most tutorials show v3 syntax
**How to avoid:**
- Use `{ error: "message" }` instead of `{ message: "message" }` for custom errors
- `.default()` values now apply even to optional fields - test this behavior
- For email/url validation, prefer `z.email()` over `z.string().email()` (deprecated)
**Warning signs:** Unexpected defaults in submitted data, different error formats

### Pitfall 2: Currency Precision Loss
**What goes wrong:** $10.10 becomes $10.09 or $10.11
**Why it happens:** JavaScript floating-point arithmetic
**How to avoid:** Store all monetary values as integers (cents)
**Warning signs:** Pennies appearing/disappearing in calculations

### Pitfall 3: Controller ref Handling
**What goes wrong:** Ref warnings in console, focus not working
**Why it happens:** Spreading `field` into components that don't forward refs
**How to avoid:** Extract ref: `({ field: { ref, ...field } })` and pass to getInputRef or forward separately
**Warning signs:** React warning about function components receiving refs

### Pitfall 4: State Tax Rate Not Updating
**What goes wrong:** State tax rate stays at default when state changes
**Why it happens:** Not using useEffect or watch() to update dependent field
**How to avoid:** Use `watch("state")` and `setValue("state_tax_rate", ...)` in useEffect
**Warning signs:** California selected but state tax shows 0%

### Pitfall 5: Form Re-renders on Every Section
**What goes wrong:** Typing in one field re-renders entire form
**Why it happens:** Parent component holding form state re-renders all children
**How to avoid:** Use React.memo() on section components, or useFormContext() pattern
**Warning signs:** Slow typing, visible lag on input

### Pitfall 6: Spouse DOB Persisting After Unmarried Selection
**What goes wrong:** Old spouse DOB submitted even when filing status is "single"
**Why it happens:** Hidden field still has value in form state
**How to avoid:** Clear spouse_dob when filing status changes to non-married:
```typescript
useEffect(() => {
  if (!filingStatus?.includes("married")) {
    form.setValue("spouse_dob", null);
  }
}, [filingStatus]);
```
**Warning signs:** Database has spouse DOB for single filers

## Code Examples

### US State Tax Data Structure
```typescript
// lib/data/states.ts
export interface StateInfo {
  code: string;
  name: string;
  taxType: "none" | "flat" | "progressive";
  topRate: number; // percentage, e.g., 13.30 for California
  brackets?: number; // number of brackets if progressive
}

export const US_STATES: StateInfo[] = [
  // No income tax
  { code: "AK", name: "Alaska", taxType: "none", topRate: 0 },
  { code: "FL", name: "Florida", taxType: "none", topRate: 0 },
  { code: "NV", name: "Nevada", taxType: "none", topRate: 0 },
  { code: "NH", name: "New Hampshire", taxType: "none", topRate: 0 },
  { code: "SD", name: "South Dakota", taxType: "none", topRate: 0 },
  { code: "TN", name: "Tennessee", taxType: "none", topRate: 0 },
  { code: "TX", name: "Texas", taxType: "none", topRate: 0 },
  { code: "WY", name: "Wyoming", taxType: "none", topRate: 0 },

  // Flat tax states
  { code: "AZ", name: "Arizona", taxType: "flat", topRate: 2.50 },
  { code: "CO", name: "Colorado", taxType: "flat", topRate: 4.40 },
  { code: "GA", name: "Georgia", taxType: "flat", topRate: 5.39 },
  { code: "ID", name: "Idaho", taxType: "flat", topRate: 5.695 },
  { code: "IL", name: "Illinois", taxType: "flat", topRate: 4.95 },
  { code: "IN", name: "Indiana", taxType: "flat", topRate: 3.00 },
  { code: "IA", name: "Iowa", taxType: "flat", topRate: 3.80 },
  { code: "KY", name: "Kentucky", taxType: "flat", topRate: 4.00 },
  { code: "LA", name: "Louisiana", taxType: "flat", topRate: 3.00 },
  { code: "MI", name: "Michigan", taxType: "flat", topRate: 4.25 },
  { code: "MS", name: "Mississippi", taxType: "flat", topRate: 4.40 },
  { code: "NC", name: "North Carolina", taxType: "flat", topRate: 4.25 },
  { code: "PA", name: "Pennsylvania", taxType: "flat", topRate: 3.07 },
  { code: "UT", name: "Utah", taxType: "flat", topRate: 4.55 },

  // Progressive tax states
  { code: "AL", name: "Alabama", taxType: "progressive", topRate: 5.00, brackets: 3 },
  { code: "AR", name: "Arkansas", taxType: "progressive", topRate: 3.90, brackets: 2 },
  { code: "CA", name: "California", taxType: "progressive", topRate: 13.30, brackets: 9 },
  { code: "CT", name: "Connecticut", taxType: "progressive", topRate: 6.99, brackets: 7 },
  { code: "DE", name: "Delaware", taxType: "progressive", topRate: 6.60, brackets: 6 },
  { code: "DC", name: "District of Columbia", taxType: "progressive", topRate: 10.75, brackets: 6 },
  { code: "HI", name: "Hawaii", taxType: "progressive", topRate: 11.00, brackets: 12 },
  { code: "KS", name: "Kansas", taxType: "progressive", topRate: 5.58, brackets: 2 },
  { code: "ME", name: "Maine", taxType: "progressive", topRate: 7.15, brackets: 3 },
  { code: "MD", name: "Maryland", taxType: "progressive", topRate: 5.75, brackets: 8 },
  { code: "MA", name: "Massachusetts", taxType: "progressive", topRate: 9.00, brackets: 2 },
  { code: "MN", name: "Minnesota", taxType: "progressive", topRate: 9.85, brackets: 4 },
  { code: "MO", name: "Missouri", taxType: "progressive", topRate: 4.70, brackets: 7 },
  { code: "MT", name: "Montana", taxType: "progressive", topRate: 5.90, brackets: 2 },
  { code: "NE", name: "Nebraska", taxType: "progressive", topRate: 5.20, brackets: 4 },
  { code: "NJ", name: "New Jersey", taxType: "progressive", topRate: 10.75, brackets: 7 },
  { code: "NM", name: "New Mexico", taxType: "progressive", topRate: 5.90, brackets: 6 },
  { code: "NY", name: "New York", taxType: "progressive", topRate: 10.90, brackets: 9 },
  { code: "ND", name: "North Dakota", taxType: "progressive", topRate: 2.50, brackets: 2 },
  { code: "OH", name: "Ohio", taxType: "progressive", topRate: 3.50, brackets: 2 },
  { code: "OK", name: "Oklahoma", taxType: "progressive", topRate: 4.75, brackets: 6 },
  { code: "OR", name: "Oregon", taxType: "progressive", topRate: 9.90, brackets: 4 },
  { code: "RI", name: "Rhode Island", taxType: "progressive", topRate: 5.99, brackets: 3 },
  { code: "SC", name: "South Carolina", taxType: "progressive", topRate: 6.20, brackets: 3 },
  { code: "VT", name: "Vermont", taxType: "progressive", topRate: 8.75, brackets: 4 },
  { code: "VA", name: "Virginia", taxType: "progressive", topRate: 5.75, brackets: 4 },
  { code: "WA", name: "Washington", taxType: "progressive", topRate: 7.00, brackets: 1 }, // Capital gains only
  { code: "WV", name: "West Virginia", taxType: "progressive", topRate: 4.82, brackets: 5 },
  { code: "WI", name: "Wisconsin", taxType: "progressive", topRate: 7.65, brackets: 4 },
];

export function getStateByCode(code: string): StateInfo | undefined {
  return US_STATES.find(s => s.code === code);
}

export function getDefaultStateTaxRate(code: string): number {
  const state = getStateByCode(code);
  return state?.topRate ?? 0;
}
```

### Smart Defaults Hook
```typescript
// hooks/use-smart-defaults.ts
import { useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import { ClientFormData } from "@/lib/validations/client";
import { getDefaultStateTaxRate } from "@/lib/data/states";
import { calculateLifeExpectancy } from "@/lib/data/actuarial";

export function useSmartDefaults(form: UseFormReturn<ClientFormData>) {
  const state = form.watch("state");
  const dob = form.watch("date_of_birth");

  // Auto-update state tax rate when state changes
  useEffect(() => {
    if (state && state.length === 2) {
      const defaultRate = getDefaultStateTaxRate(state);
      form.setValue("state_tax_rate", defaultRate);
    }
  }, [state, form]);

  // Calculate default life expectancy from DOB
  useEffect(() => {
    if (dob && !form.getValues("life_expectancy")) {
      const lifeExp = calculateLifeExpectancy(dob);
      if (lifeExp) {
        form.setValue("life_expectancy", lifeExp);
      }
    }
  }, [dob, form]);

  // Calculate default start age from current age
  useEffect(() => {
    if (dob && !form.getValues("start_age")) {
      const birthDate = new Date(dob);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      form.setValue("start_age", Math.max(age, 50));
    }
  }, [dob, form]);
}
```

### Complete Form Structure
```typescript
// components/clients/client-form.tsx
"use client";

import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { clientSchema, type ClientFormData } from "@/lib/validations/client";
import { useSmartDefaults } from "@/hooks/use-smart-defaults";
import { useCreateClient, useUpdateClient } from "@/lib/queries/clients";

import { PersonalInfoSection } from "./sections/personal-info";
import { AccountBalancesSection } from "./sections/account-balances";
import { TaxConfigSection } from "./sections/tax-config";
import { IncomeSourcesSection } from "./sections/income-sources";
import { ConversionSection } from "./sections/conversion";
import { AdvancedSection } from "./sections/advanced";

interface ClientFormProps {
  defaultValues?: Partial<ClientFormData>;
  clientId?: string;
  onSuccess?: () => void;
}

export function ClientForm({ defaultValues, clientId, onSuccess }: ClientFormProps) {
  const isEditing = !!clientId;
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      // Personal
      name: "",
      date_of_birth: "",
      state: "",
      filing_status: "married_filing_jointly",
      spouse_dob: null,
      life_expectancy: null,
      // Accounts (in cents)
      traditional_ira: 0,
      roth_ira: 0,
      taxable_accounts: 0,
      other_retirement: 0,
      // Tax
      federal_bracket: "auto",
      state_tax_rate: null,
      include_niit: true,
      include_aca: false,
      // Income (in cents)
      ss_self: 0,
      ss_spouse: 0,
      pension: 0,
      other_income: 0,
      ss_start_age: 67,
      // Conversion
      strategy: "moderate",
      start_age: 65,
      end_age: 75,
      tax_payment_source: "from_taxable",
      // Advanced
      growth_rate: 6,
      inflation_rate: 2.5,
      heir_bracket: "32",
      projection_years: 40,
      widow_analysis: false,
      sensitivity: false,
      ...defaultValues,
    },
  });

  // Apply smart defaults
  useSmartDefaults(form);

  const onSubmit = async (data: ClientFormData) => {
    try {
      if (isEditing) {
        await updateClient.mutateAsync({ id: clientId, data });
      } else {
        await createClient.mutateAsync(data);
      }
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isPending = createClient.isPending || updateClient.isPending;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <PersonalInfoSection />
        <AccountBalancesSection />
        <TaxConfigSection />
        <IncomeSourcesSection />
        <ConversionSection />
        <AdvancedSection />

        <div className="flex justify-end gap-4 pt-4 border-t">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? "Update Client" : "Create Client"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod v3 message syntax | Zod v4 `error` parameter | 2025 | Update all custom error messages |
| shadcn Form component | shadcn Field component | 2025 | Field is now recommended over Form |
| Controlled inputs for currency | react-currency-input-field | Current | Better UX, less code |
| Storing currency as float | Storing as integers (cents) | Best practice | Avoids precision issues |
| Manual form sections | useFormContext() pattern | Current | Better performance |

**Deprecated/outdated:**
- `z.string().email()` method syntax - use `z.email()` (top-level)
- Zod v3 `{ message: "..." }` - use `{ error: "..." }` or error function
- shadcn `<Form>` component wrapper - use `<Field>` components directly

## Open Questions

1. **Database Schema Update**
   - What we know: Current schema has 4 fields, need 28
   - What's unclear: Whether to add columns to existing `clients` table or create related table
   - Recommendation: Add all columns to clients table with defaults; simpler than joins

2. **Currency Storage Precision**
   - What we know: Storing as cents (integers) is standard
   - What's unclear: Whether existing API expects dollars or cents
   - Recommendation: Check Phase 02 plans, align with existing pattern

3. **Progressive State Tax Brackets**
   - What we know: Some states have progressive brackets (CA has 9)
   - What's unclear: Whether to show simple top rate or calculate actual rate
   - Recommendation: For MVP, use top marginal rate; full bracket calc is Phase 4+ (projections)

## Sources

### Primary (HIGH confidence)
- [React Hook Form Advanced Usage](https://react-hook-form.com/advanced-usage) - watch(), Controller patterns
- [Zod v4 Migration Guide](https://zod.dev/v4/changelog) - Breaking changes from v3
- [shadcn/ui Field Component](https://ui.shadcn.com/docs/components/field) - Current form patterns
- [react-currency-input-field GitHub](https://github.com/cchanxzy/react-currency-input-field) - API and integration

### Secondary (MEDIUM confidence)
- [Tax Foundation 2025 State Tax Rates](https://taxfoundation.org/data/all/state/state-income-tax-rates/) - State tax data
- [Currency Input with RHF and Zod](https://arthurpedroti.com.br/currency-input-or-any-input-with-mask-integration-with-react-hook-form-and-zod/) - Controller integration pattern
- [Advanced React Hook Form + Zod + shadcn](https://wasp.sh/blog/2025/01/22/advanced-react-hook-form-zod-shadcn) - Form patterns

### Tertiary (LOW confidence)
- [hermantran/taxgraphs](https://github.com/hermantran/taxgraphs) - Tax data JSON structure (verify before using)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries already installed, well-documented
- Architecture patterns: HIGH - Verified against official docs and existing codebase
- Currency/Percent inputs: HIGH - react-currency-input-field is mature, 315K weekly downloads
- State tax data: MEDIUM - Tax Foundation is authoritative but data needs annual updates
- Zod v4 patterns: HIGH - Official migration guide consulted

**Research date:** 2026-01-18
**Valid until:** 2026-02-18 (30 days - stack is stable, tax data valid for 2025 tax year)
