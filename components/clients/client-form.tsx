"use client";

import { useState } from "react";
import { useForm, FormProvider, Resolver, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { clientBlueprintSchema, type ClientFormData } from "@/lib/validations/client";
import { useCreateClient, useUpdateClient } from "@/lib/queries/clients";
import { useSmartDefaults } from "@/hooks/use-smart-defaults";
import type { Client } from "@/lib/types/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";

// Import all 8 Blueprint sections
import { ClientDataSection } from "./sections/client-data";
import { CurrentAccountSection } from "./sections/current-account";
import { NewAccountSection } from "./sections/new-account";
import { TaxDataSection } from "./sections/tax-data";
import { TaxableIncomeSection } from "./sections/taxable-income";
import { ConversionSection } from "./sections/conversion";
import { RothWithdrawalsSection } from "./sections/roth-withdrawals";
import { AdvancedDataSection } from "./sections/advanced-data";

interface ClientFormProps {
  client?: Client;
  onCancel?: () => void;
}

export function ClientForm({ client, onCancel }: ClientFormProps) {
  const router = useRouter();
  const isEditing = !!client;

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientBlueprintSchema) as Resolver<ClientFormData>,
    defaultValues: {
      // Blueprint Type (product preset)
      blueprint_type: client?.blueprint_type ?? "fia",

      // Section 1: Client Data
      filing_status: client?.filing_status ?? "married_filing_jointly",
      name: client?.name ?? "",
      age: client?.age ?? 62,

      // Section 2: Current Account
      qualified_account_value: client?.qualified_account_value ?? 25000000, // $250,000 in cents

      // Section 3: New Account (Insurance Product)
      carrier_name: client?.carrier_name ?? "Generic Carrier",
      product_name: client?.product_name ?? "Generic Product",
      bonus_percent: client?.bonus_percent ?? 10,
      rate_of_return: client?.rate_of_return ?? 7,

      // Section 4: Tax Data
      state: client?.state ?? "CA",
      constraint_type: client?.constraint_type ?? "none",
      tax_rate: client?.tax_rate ?? 24,
      max_tax_rate: client?.max_tax_rate ?? 24,
      tax_payment_source: client?.tax_payment_source ?? "from_taxable",
      state_tax_rate: client?.state_tax_rate ?? null,

      // Section 5: Taxable Income
      ssi_payout_age: client?.ssi_payout_age ?? 67,
      ssi_annual_amount: client?.ssi_annual_amount ?? 2400000, // $24,000 in cents
      non_ssi_income: client?.non_ssi_income ?? [],

      // Section 6: Conversion
      conversion_type: client?.conversion_type ?? "optimized_amount",
      protect_initial_premium: client?.protect_initial_premium ?? true,

      // Section 7: Withdrawals
      withdrawal_type: client?.withdrawal_type ?? "no_withdrawals",

      // Section 8: Advanced
      surrender_years: client?.surrender_years ?? 7,
      penalty_free_percent: client?.penalty_free_percent ?? 10,
      baseline_comparison_rate: client?.baseline_comparison_rate ?? 7,
      post_contract_rate: client?.post_contract_rate ?? 7,
      years_to_defer_conversion: client?.years_to_defer_conversion ?? 0,
      end_age: client?.end_age ?? 100,
      heir_tax_rate: client?.heir_tax_rate ?? 40,
      widow_analysis: client?.widow_analysis ?? false,

      // Additional fields needed
      taxable_accounts: client?.taxable_accounts ?? 0,
      roth_ira: client?.roth_ira ?? 0,
    },
  });

  // Apply smart defaults
  useSmartDefaults(form);

  const isPending = createClient.isPending || updateClient.isPending;
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const onValidationError = (errors: FieldErrors<ClientFormData>) => {
    const messages: string[] = [];
    const flattenErrors = (obj: Record<string, unknown>, prefix = "") => {
      for (const key in obj) {
        const val = obj[key] as Record<string, unknown>;
        if (val?.message) {
          const label = prefix ? `${prefix} > ${key}` : key;
          messages.push(`${label}: ${val.message}`);
        } else if (val && typeof val === "object") {
          flattenErrors(val as Record<string, unknown>, key);
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
    try {
      // Calculate date_of_birth from age (assume Jan 1st of calculated birth year)
      const currentYear = new Date().getFullYear();
      const birthYear = currentYear - data.age;
      const dateOfBirth = `${birthYear}-01-01`;

      // Calculate spouse_dob if married (validation requires it)
      let spouseDob = null;
      if (data.filing_status === "married_filing_jointly" || data.filing_status === "married_filing_separately") {
        // Assume spouse is same age for now since we don't collect it
        spouseDob = dateOfBirth;
      }

      // Transform form data to include legacy fields for backwards compatibility
      const submitData = {
        ...data,
        // Map new fields to legacy equivalents for calculation engine
        traditional_ira: data.qualified_account_value,
        other_retirement: 0,
        ss_self: data.ssi_annual_amount,
        ss_spouse: 0,
        ss_start_age: data.ssi_payout_age,
        growth_rate: data.rate_of_return,
        strategy: mapConversionTypeToStrategy(data.conversion_type),
        start_age: data.age + data.years_to_defer_conversion,
        projection_years: data.end_age - data.age,
        heir_bracket: String(data.heir_tax_rate),
        federal_bracket: String(data.tax_rate),
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
        router.push(`/clients/${client.id}`);
      } else {
        await createClient.mutateAsync(submitData);
        router.push("/clients");
      }
    } catch (error) {
      console.error("Form submission error:", error);
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
        <CardTitle>{isEditing ? "Edit Client" : "New Client Blueprint"}</CardTitle>
      </CardHeader>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onValidationError)}>
          <CardContent className="space-y-8">
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
            <ClientDataSection />
            <CurrentAccountSection />
            <NewAccountSection />
            <TaxDataSection />
            <TaxableIncomeSection />
            <ConversionSection />
            <RothWithdrawalsSection />
            <AdvancedDataSection />

            {/* API error display */}
            {(createClient.isError || updateClient.isError) && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {createClient.error?.message || updateClient.error?.message}
              </div>
            )}
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
