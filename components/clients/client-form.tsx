"use client";

import { useState } from "react";
import { useForm, FormProvider, Resolver, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { clientFormulaSchema, type ClientFormData } from "@/lib/validations/client";
import { useCreateClient, useUpdateClient } from "@/lib/queries/clients";
import { useUserSettings } from "@/lib/queries/settings";
import { useSmartDefaults } from "@/hooks/use-smart-defaults";
import type { Client } from "@/lib/types/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";

// Import all 8 Formula sections
import { ClientDataSection } from "./sections/client-data";
import { CurrentAccountSection } from "./sections/current-account";
import { NewAccountSection } from "./sections/new-account";
import { TaxDataSection } from "./sections/tax-data";
import { TaxableIncomeSection } from "./sections/taxable-income";
import { ConversionSection } from "./sections/conversion";
import { AumAllocationSection } from "./sections/aum-allocation";
import { RothWithdrawalsSection } from "./sections/roth-withdrawals";
import { AdvancedDataSection } from "./sections/advanced-data";

interface ClientFormProps {
  client?: Client;
  /**
   * Pre-fill values for new-client mode. Used by the training centre to
   * drop a cast member's profile into the form so an advisor can see the
   * concept they just learned applied to a real client they'd save.
   * Defaults flow into the form's defaultValues but do NOT trigger
   * `isEditing`, so submit still creates a fresh client row.
   */
  defaults?: Partial<Client>;
  onCancel?: () => void;
}

export function ClientForm({ client, defaults, onCancel }: ClientFormProps) {
  const router = useRouter();
  const isEditing = !!client;

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  // Fetch user defaults from settings (only used for new formulas)
  const { data: userSettings } = useUserSettings();
  const ud = (userSettings?.default_values ?? {}) as Record<string, unknown>;
  const d = defaults;

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientFormulaSchema) as Resolver<ClientFormData>,
    defaultValues: {
      // Product Preset
      // Priority: client value (edit mode) > prefill defaults > user default > system default
      blueprint_type: client?.blueprint_type ?? d?.blueprint_type ?? (ud.blueprint_type as ClientFormData["blueprint_type"]) ?? "fia",
      custom_product_id: client?.custom_product_id ?? d?.custom_product_id ?? null,

      // Section 1: Client Data
      scenario_name: client?.scenario_name ?? d?.scenario_name ?? null,
      filing_status: client?.filing_status ?? d?.filing_status ?? "single",
      name: client?.name ?? d?.name ?? "",
      age: client?.age ?? d?.age ?? 62,
      spouse_name: client?.spouse_name ?? d?.spouse_name ?? "",
      spouse_age: client?.spouse_age ?? d?.spouse_age ?? 60,

      // Section 2: Current Account
      qualified_account_value: client?.qualified_account_value ?? d?.qualified_account_value ?? 25000000, // $250,000 in cents

      // Section 3: New Account (Insurance Product)
      carrier_name: client?.carrier_name ?? d?.carrier_name ?? (ud.carrier_name as string) ?? "Generic Carrier",
      product_name: client?.product_name ?? d?.product_name ?? (ud.product_name as string) ?? "Generic Product",
      bonus_percent: client?.bonus_percent ?? d?.bonus_percent ?? (ud.bonus_percent as number) ?? 10,
      rate_of_return: client?.rate_of_return ?? d?.rate_of_return ?? (ud.rate_of_return as number) ?? 7,
      anniversary_bonus_percent: client?.anniversary_bonus_percent ?? d?.anniversary_bonus_percent ?? null,
      anniversary_bonus_years: client?.anniversary_bonus_years ?? d?.anniversary_bonus_years ?? null,

      // Section 4: Tax Data
      state: client?.state ?? d?.state ?? (ud.state as string) ?? "CA",
      // Default 'bracket_ceiling' (the engine's implicit always-active
      // behavior). Legacy values 'none' and 'fixed_amount' are migrated to
      // bracket_ceiling on read.
      constraint_type: client?.constraint_type ?? d?.constraint_type ?? (ud.constraint_type as ClientFormData["constraint_type"]) ?? "bracket_ceiling",
      target_irmaa_tier: client?.target_irmaa_tier ?? "standard",
      tax_rate: client?.tax_rate ?? d?.tax_rate ?? (ud.tax_rate as number) ?? 24,
      max_tax_rate: client?.max_tax_rate ?? d?.max_tax_rate ?? (ud.max_tax_rate as number) ?? 24,
      tax_payment_source: client?.tax_payment_source ?? d?.tax_payment_source ?? (ud.tax_payment_source as ClientFormData["tax_payment_source"]) ?? "from_taxable",
      state_tax_rate: client?.state_tax_rate ?? d?.state_tax_rate ?? null,

      // Section 5: Taxable Income
      ssi_payout_age: client?.ssi_payout_age ?? d?.ssi_payout_age ?? 67,
      ssi_annual_amount: client?.ssi_annual_amount ?? d?.ssi_annual_amount ?? 2400000, // $24,000 in cents
      spouse_ssi_payout_age: client?.spouse_ssi_payout_age ?? d?.spouse_ssi_payout_age ?? 67,
      spouse_ssi_annual_amount: client?.spouse_ssi_annual_amount ?? d?.spouse_ssi_annual_amount ?? 0,
      non_ssi_income: client?.non_ssi_income ?? d?.non_ssi_income ?? [],
      withdrawals: client?.withdrawals ?? d?.withdrawals ?? [],

      // Section 6: Conversion
      conversion_type: client?.conversion_type ?? d?.conversion_type ?? (ud.conversion_type as ClientFormData["conversion_type"]) ?? "optimized_amount",
      fixed_conversion_amount: client?.fixed_conversion_amount ?? d?.fixed_conversion_amount ?? null,
      target_partial_amount: client?.target_partial_amount ?? d?.target_partial_amount ?? null,
      respect_penalty_free_limit: client?.respect_penalty_free_limit ?? d?.respect_penalty_free_limit ?? false,
      penalty_free_scope: client?.penalty_free_scope ?? d?.penalty_free_scope ?? "tax_only",
      protect_initial_premium: client?.protect_initial_premium ?? d?.protect_initial_premium ?? (ud.protect_initial_premium as boolean) ?? true,

      // Section 7: Withdrawals
      withdrawal_type: client?.withdrawal_type ?? d?.withdrawal_type ?? (ud.withdrawal_type as ClientFormData["withdrawal_type"]) ?? "no_withdrawals",

      // GI-specific fields
      payout_type: client?.payout_type ?? d?.payout_type ?? "individual",
      income_start_age: client?.income_start_age ?? d?.income_start_age ?? 65,
      guaranteed_rate_of_return: client?.guaranteed_rate_of_return ?? d?.guaranteed_rate_of_return ?? 0,
      roll_up_option: client?.roll_up_option ?? d?.roll_up_option ?? null,
      payout_option: client?.payout_option ?? d?.payout_option ?? null,
      gi_conversion_years: client?.gi_conversion_years ?? d?.gi_conversion_years ?? 5,
      gi_conversion_bracket: client?.gi_conversion_bracket ?? d?.gi_conversion_bracket ?? 24,

      // Section 8: Advanced
      surrender_years: client?.surrender_years ?? d?.surrender_years ?? (ud.surrender_years as number) ?? 7,
      surrender_schedule: client?.surrender_schedule ?? d?.surrender_schedule ?? null,
      penalty_free_percent: client?.penalty_free_percent ?? d?.penalty_free_percent ?? (ud.penalty_free_percent as number) ?? 10,
      baseline_comparison_rate: client?.baseline_comparison_rate ?? d?.baseline_comparison_rate ?? (ud.baseline_comparison_rate as number) ?? 7,
      post_contract_rate: client?.post_contract_rate ?? d?.post_contract_rate ?? (ud.post_contract_rate as number) ?? 7,
      years_to_defer_conversion: client?.years_to_defer_conversion ?? d?.years_to_defer_conversion ?? (ud.years_to_defer_conversion as number) ?? 0,
      end_age: client?.end_age ?? d?.end_age ?? (ud.end_age as number) ?? 100,
      heir_tax_rate: client?.heir_tax_rate ?? d?.heir_tax_rate ?? (ud.heir_tax_rate as number) ?? 40,
      widow_analysis: client?.widow_analysis ?? d?.widow_analysis ?? false,
      widow_death_age: client?.widow_death_age ?? d?.widow_death_age ?? null,
      rmd_treatment: client?.rmd_treatment ?? d?.rmd_treatment ?? (ud.rmd_treatment as ClientFormData["rmd_treatment"]) ?? "reinvested",
      rmds_handled_externally: client?.rmds_handled_externally ?? false,
      // AUM split-allocation defaults — 0% means feature off (current behavior).
      aum_allocation_percent: client?.aum_allocation_percent ?? d?.aum_allocation_percent ?? 0,
      aum_fee_percent: client?.aum_fee_percent ?? d?.aum_fee_percent ?? 1,
      aum_dividend_yield: client?.aum_dividend_yield ?? d?.aum_dividend_yield ?? 2,
      aum_turnover_percent: client?.aum_turnover_percent ?? d?.aum_turnover_percent ?? 10,
      aum_withdrawal_years: client?.aum_withdrawal_years ?? d?.aum_withdrawal_years ?? 5,
      ltcg_rate: client?.ltcg_rate ?? d?.ltcg_rate ?? 15,

      // Additional fields needed
      taxable_accounts: client?.taxable_accounts ?? d?.taxable_accounts ?? 0,
      roth_ira: client?.roth_ira ?? d?.roth_ira ?? 0,
    },
  });

  // Apply smart defaults
  useSmartDefaults(form);

  const isPending = createClient.isPending || updateClient.isPending;
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onValidationError = (errors: FieldErrors<ClientFormData>) => {
    const messages: string[] = [];

    // Human-readable field name mapping
    const fieldLabels: Record<string, string> = {
      scenario_name: "Scenario Name",
      name: "Name",
      age: "Age",
      spouse_name: "Spouse Name",
      spouse_age: "Spouse Age",
      filing_status: "Filing Status",
      state: "State",
      qualified_account_value: "Qualified Account Value",
      carrier_name: "Carrier Name",
      product_name: "Product Name",
      bonus_percent: "Bonus Percent",
      rate_of_return: "Rate of Return",
      max_tax_rate: "Max Tax Rate",
      tax_rate: "Tax Rate",
      ssi_payout_age: "Social Security Start Age",
      ssi_annual_amount: "SSI Annual Amount",
      spouse_ssi_payout_age: "Spouse Social Security Start Age",
      spouse_ssi_annual_amount: "Spouse SSI Annual Amount",
      end_age: "End Age",
      heir_tax_rate: "Heir Tax Rate",
      year: "Year",
      gross_taxable: "Gross Taxable Amount",
      tax_exempt: "Tax Exempt Amount",
      // Section-prefixed labels for array-shaped fields so the error list
      // tells advisors exactly where to scroll to fix the rows. Without
      // these, a row-level error like "Withdrawals Row 3: Year must be
      // 2024 or later" doesn't point at Section 8 — Jorge Tola hit this
      // and filed a ticket instead of finding the section himself.
      non_ssi_income: "Section 5: Taxable Income",
      withdrawals: "Section 8: IRA / Roth Withdrawals",
    };

    const getLabel = (key: string) => fieldLabels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    const flattenErrors = (obj: Record<string, unknown>, parentLabel = "") => {
      for (const key in obj) {
        const val = obj[key] as Record<string, unknown>;
        if (val?.message) {
          const label = parentLabel || getLabel(key);
          messages.push(`${label}: ${val.message as string}`);
        } else if (val && typeof val === "object") {
          // For array entries (non_ssi_income.0.year), show as "Non-SSI Income Row 1"
          const isArrayIndex = /^\d+$/.test(key);
          const nextLabel = isArrayIndex
            ? `${parentLabel || "Income"} Row ${Number(key) + 1}`
            : parentLabel
              ? `${parentLabel} — ${getLabel(key)}`
              : getLabel(key);
          flattenErrors(val as Record<string, unknown>, nextLabel);
        }
      }
    };
    flattenErrors(errors as Record<string, unknown>);
    setValidationErrors(messages);
    // Scroll to top so user sees the errors
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit = async (data: ClientFormData) => {
    setValidationErrors([]);
    setSubmitError(null);
    try {
      // Filter out any invalid/ghost income entries (e.g., from failed deletes)
      // and recompute age from year so it's always consistent with the year field.
      // Match the display logic in IncomeTableRow (MFJ only shows spouse age).
      if (data.non_ssi_income) {
        const currentYearForAge = new Date().getFullYear();
        const clientAge = data.age;
        const showsSpouseAge =
          data.filing_status === "married_filing_jointly" && data.spouse_age
            ? data.spouse_age
            : null;
        data.non_ssi_income = data.non_ssi_income
          .filter((entry) => entry.year && !Number.isNaN(entry.year) && entry.year >= 2024)
          .map((entry) => {
            const delta = entry.year - currentYearForAge;
            const cAge = clientAge + delta;
            const sAge = showsSpouseAge ? showsSpouseAge + delta : null;
            return {
              ...entry,
              age: sAge ? `${cAge}/${sAge}` : String(cAge),
            };
          });
      }

      // Calculate date_of_birth from age (assume Jan 1st of calculated birth year)
      const currentYear = new Date().getFullYear();
      const birthYear = currentYear - data.age;
      const dateOfBirth = `${birthYear}-01-01`;

      // Determine if married
      const isMarriedFiling =
        data.filing_status === "married_filing_jointly" ||
        data.filing_status === "married_filing_separately";

      // Calculate spouse_dob if married (from spouse_age, not client's own age)
      let spouseDob: string | null = null;
      if (isMarriedFiling && data.spouse_age) {
        const spouseBirthYear = currentYear - data.spouse_age;
        spouseDob = `${spouseBirthYear}-01-01`;
      }

      // Strip spouse fields for non-married filers
      const cleanedData = { ...data };
      if (!isMarriedFiling) {
        delete (cleanedData as Record<string, unknown>).spouse_name;
        delete (cleanedData as Record<string, unknown>).spouse_age;
        delete (cleanedData as Record<string, unknown>).spouse_ssi_payout_age;
        delete (cleanedData as Record<string, unknown>).spouse_ssi_annual_amount;
      }

      // Transform form data to include legacy fields for backwards compatibility
      const submitData = {
        ...cleanedData,
        // Map new fields to legacy equivalents for calculation engine
        traditional_ira: data.qualified_account_value,
        other_retirement: 0,
        ss_self: data.ssi_annual_amount,
        ss_spouse: isMarriedFiling ? (data.spouse_ssi_annual_amount ?? 0) : 0,
        ss_start_age: data.ssi_payout_age,
        growth_rate: data.rate_of_return,
        strategy: mapConversionTypeToStrategy(data.conversion_type),
        start_age: data.age + data.years_to_defer_conversion,
        projection_years: data.end_age - data.age,
        heir_bracket: String(data.heir_tax_rate),
        federal_bracket: data.scenario_name || undefined,
        inflation_rate: 2.5,
        include_niit: false,
        include_aca: false,
        pension: 0,
        other_income: 0,
        sensitivity: false,
        date_of_birth: dateOfBirth, // Fixed: Generated from Age
        spouse_dob: spouseDob,      // Fixed: Generated if married
        life_expectancy: data.end_age,
      };

      if (isEditing && client) {
        await updateClient.mutateAsync({ id: client.id, data: submitData });
        // Use window.location for reliable navigation after mutation
        window.location.href = `/clients/${client.id}`;
      } else {
        await createClient.mutateAsync(submitData);
        window.location.href = "/clients";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      setSubmitError(message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else if (isEditing && client) {
      router.push(`/clients/${client.id}`);
    } else {
      router.push("/clients");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Client" : "New Client Formula"}</CardTitle>
      </CardHeader>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onValidationError)}>
          <CardContent className="space-y-8">
            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-800">
                    Please fix the following errors:
                  </span>
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  {validationErrors.map((msg, i) => (
                    <li key={i} className="text-sm text-red-700">{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Submission / API errors */}
            {(submitError || createClient.isError || updateClient.isError) && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-800">
                    {submitError || createClient.error?.message || updateClient.error?.message}
                  </span>
                </div>
              </div>
            )}
            <ClientDataSection />
            <CurrentAccountSection />
            <NewAccountSection />
            <TaxDataSection />
            <TaxableIncomeSection />
            <ConversionSection />
            <AumAllocationSection />
            <RothWithdrawalsSection />
            <AdvancedDataSection />

          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Client"}
            </Button>
          </CardFooter>
        </form>
      </FormProvider>
    </Card>
  );
}

// Helper function to map conversion_type to legacy strategy
function mapConversionTypeToStrategy(conversionType: ClientFormData["conversion_type"]) {
  switch (conversionType) {
    case "optimized_amount":
      return "moderate" as const;
    case "fixed_amount":
      return "conservative" as const;
    case "full_conversion":
      return "aggressive" as const;
    case "no_conversion":
      return "conservative" as const;
    default:
      return "moderate" as const;
  }
}
