"use client";

import { useForm, FormProvider, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { clientFullSchema, type ClientFormData } from "@/lib/validations/client";
import { useCreateClient, useUpdateClient } from "@/lib/queries/clients";
import { useSmartDefaults } from "@/hooks/use-smart-defaults";
import type { Client } from "@/lib/types/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Import all 6 sections
import { PersonalInfoSection } from "./sections/personal-info";
import { AccountBalancesSection } from "./sections/account-balances";
import { TaxConfigSection } from "./sections/tax-config";
import { IncomeSourcesSection } from "./sections/income-sources";
import { ConversionSection } from "./sections/conversion";
import { AdvancedSection } from "./sections/advanced";

interface ClientFormProps {
  client?: Client; // If provided, form is in edit mode
  onCancel?: () => void;
}

export function ClientForm({ client, onCancel }: ClientFormProps) {
  const router = useRouter();
  const isEditing = !!client;

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const form = useForm<ClientFormData>({
    // Type assertion needed because Zod .default() makes input types optional
    // but our explicit ClientFormData type has all fields required for defaultValues
    resolver: zodResolver(clientFullSchema) as Resolver<ClientFormData>,
    defaultValues: {
      // Personal (use client values if editing)
      name: client?.name ?? "",
      date_of_birth: client?.date_of_birth ?? "",
      state: client?.state ?? "",
      filing_status: client?.filing_status ?? "married_filing_jointly",
      spouse_dob: client?.spouse_dob ?? null,
      life_expectancy: client?.life_expectancy ?? null,

      // Account Balances (in cents)
      traditional_ira: client?.traditional_ira ?? 0,
      roth_ira: client?.roth_ira ?? 0,
      taxable_accounts: client?.taxable_accounts ?? 0,
      other_retirement: client?.other_retirement ?? 0,

      // Tax Configuration
      federal_bracket: client?.federal_bracket ?? "auto",
      state_tax_rate: client?.state_tax_rate ?? null,
      include_niit: client?.include_niit ?? true,
      include_aca: client?.include_aca ?? false,

      // Income Sources (in cents)
      ss_self: client?.ss_self ?? 0,
      ss_spouse: client?.ss_spouse ?? 0,
      pension: client?.pension ?? 0,
      other_income: client?.other_income ?? 0,
      ss_start_age: client?.ss_start_age ?? 67,

      // Conversion Settings
      strategy: client?.strategy ?? "moderate",
      start_age: client?.start_age ?? 65,
      end_age: client?.end_age ?? 75,
      tax_payment_source: client?.tax_payment_source ?? "from_taxable",

      // Advanced Options
      growth_rate: client?.growth_rate ?? 6,
      inflation_rate: client?.inflation_rate ?? 2.5,
      heir_bracket: client?.heir_bracket ?? "32",
      projection_years: client?.projection_years ?? 40,
      widow_analysis: client?.widow_analysis ?? false,
      sensitivity: client?.sensitivity ?? false,
    },
  });

  // Apply smart defaults (life expectancy, start age from DOB)
  useSmartDefaults(form);

  const isPending = createClient.isPending || updateClient.isPending;

  const onSubmit = async (data: ClientFormData) => {
    try {
      if (isEditing && client) {
        await updateClient.mutateAsync({ id: client.id, data });
        router.push(`/clients/${client.id}`);
      } else {
        await createClient.mutateAsync(data);
        router.push("/clients");
      }
    } catch (error) {
      // Error is displayed via mutation state
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
        <CardTitle>{isEditing ? "Edit Client" : "New Client"}</CardTitle>
      </CardHeader>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-8">
            <PersonalInfoSection />
            <AccountBalancesSection />
            <TaxConfigSection />
            <IncomeSourcesSection />
            <ConversionSection />
            <AdvancedSection />

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
