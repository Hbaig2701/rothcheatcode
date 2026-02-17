"use client";

import { useEffect } from "react";
import { useForm, FormProvider, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientFormulaSchema, type ClientFormData } from "@/lib/validations/client";
import { useUpdateClient } from "@/lib/queries/clients";
import { useRecalculateProjection } from "@/lib/queries/projections";
import type { Client } from "@/lib/types/client";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROWTH_PRODUCTS, GUARANTEED_INCOME_PRODUCTS, ALL_PRODUCTS, type FormulaType } from "@/lib/config/products";

// Import Sections
import { ClientDataSection } from "@/components/clients/sections/client-data";
import { CurrentAccountSection } from "@/components/clients/sections/current-account";
import { NewAccountSection } from "@/components/clients/sections/new-account";
import { TaxDataSection } from "@/components/clients/sections/tax-data";
import { TaxableIncomeSection } from "@/components/clients/sections/taxable-income";
import { ConversionSection } from "@/components/clients/sections/conversion";
import { RothWithdrawalsSection } from "@/components/clients/sections/roth-withdrawals";
import { AdvancedDataSection } from "@/components/clients/sections/advanced-data";

interface InputDrawerProps {
  client: Client;
  onClose: () => void;
}

export function InputDrawer({ client, onClose }: InputDrawerProps) {
  const updateClient = useUpdateClient();
  const recalculateProjection = useRecalculateProjection();

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientFormulaSchema) as Resolver<ClientFormData>,
    defaultValues: {
      blueprint_type: client?.blueprint_type ?? "fia",
      filing_status: client?.filing_status ?? "married_filing_jointly",
      name: client?.name ?? "",
      age: client?.age ?? 62,
      spouse_name: client?.spouse_name ?? "",
      spouse_age: client?.spouse_age ?? (
        (client?.filing_status === "married_filing_jointly" || client?.filing_status === "married_filing_separately") ? 60 : undefined
      ),
      qualified_account_value: client?.qualified_account_value ?? 0,
      carrier_name: client?.carrier_name ?? "Generic Carrier",
      product_name: client?.product_name ?? "Generic Product",
      bonus_percent: client?.bonus_percent ?? 10,
      rate_of_return: client?.rate_of_return ?? 7,
      state: client?.state ?? "CA",
      constraint_type: client?.constraint_type ?? "none",
      tax_rate: client?.tax_rate ?? 24,
      max_tax_rate: client?.max_tax_rate ?? 24,
      tax_payment_source: client?.tax_payment_source ?? "from_taxable",
      state_tax_rate: client?.state_tax_rate ?? null,
      ssi_payout_age: client?.ssi_payout_age ?? 67,
      ssi_annual_amount: client?.ssi_annual_amount ?? 2400000,
      spouse_ssi_payout_age: client?.spouse_ssi_payout_age ?? 67,
      spouse_ssi_annual_amount: client?.spouse_ssi_annual_amount ?? 0,
      non_ssi_income: client?.non_ssi_income ?? [],
      conversion_type: client?.conversion_type ?? "optimized_amount",
      protect_initial_premium: client?.protect_initial_premium ?? true,
      withdrawal_type: client?.withdrawal_type ?? "no_withdrawals",
      payout_type: client?.payout_type ?? "individual",
      income_start_age: client?.income_start_age ?? 65,
      guaranteed_rate_of_return: client?.guaranteed_rate_of_return ?? 0,
      roll_up_option: client?.roll_up_option ?? null,
      payout_option: client?.payout_option ?? null,
      gi_conversion_years: client?.gi_conversion_years ?? 5,
      gi_conversion_bracket: client?.gi_conversion_bracket ?? 24,
      surrender_years: client?.surrender_years ?? 7,
      penalty_free_percent: client?.penalty_free_percent ?? 10,
      baseline_comparison_rate: client?.baseline_comparison_rate ?? 7,
      post_contract_rate: client?.post_contract_rate ?? 7,
      years_to_defer_conversion: client?.years_to_defer_conversion ?? 0,
      end_age: client?.end_age ?? 100,
      heir_tax_rate: client?.heir_tax_rate ?? 40,
      widow_analysis: client?.widow_analysis ?? false,
      rmd_treatment: client?.rmd_treatment ?? "reinvested",
      fixed_conversion_amount: client?.fixed_conversion_amount ?? null,
      surrender_schedule: client?.surrender_schedule ?? null,
      taxable_accounts: client?.taxable_accounts ?? 0,
      roth_ira: client?.roth_ira ?? 0,
    },
  });

  const isPending = updateClient.isPending || recalculateProjection.isPending;

  // Sync form fields with formula type defaults on load
  useEffect(() => {
    const formulaType = form.getValues("blueprint_type") as FormulaType;
    const product = ALL_PRODUCTS[formulaType];
    if (!product) return;

    const currentCarrier = form.getValues("carrier_name");
    const currentProduct = form.getValues("product_name");

    const otherProducts = Object.values(ALL_PRODUCTS).filter(p => p.id !== formulaType);
    const matchesOtherLockedProduct = otherProducts.some(p =>
      p.lockedFields.includes("carrierName") &&
      p.defaults.carrierName === currentCarrier
    );

    if (matchesOtherLockedProduct) {
      form.setValue("carrier_name", product.defaults.carrierName);
      form.setValue("product_name", product.defaults.productName);
      form.setValue("bonus_percent", product.defaults.bonus);
      form.setValue("surrender_years", product.defaults.surrenderYears);
      form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
    }

    if (product.lockedFields.includes("carrierName") && currentCarrier !== product.defaults.carrierName) {
      form.setValue("carrier_name", product.defaults.carrierName);
    }
    if (product.lockedFields.includes("productName") && currentProduct !== product.defaults.productName) {
      form.setValue("product_name", product.defaults.productName);
    }
  }, [form, client?.id]);

  const onSubmit = async (data: ClientFormData) => {
    try {
      const currentYear = new Date().getFullYear();
      const birthYear = currentYear - data.age;
      const dateOfBirth = `${birthYear}-01-01`;

      let spouseDob = null;
      if (data.filing_status === "married_filing_jointly" || data.filing_status === "married_filing_separately") {
        if (data.spouse_age) {
          const spYear = currentYear - data.spouse_age;
          spouseDob = `${spYear}-01-01`;
        } else {
          spouseDob = dateOfBirth;
        }
      }

      const submitData = {
        ...data,
        traditional_ira: data.qualified_account_value,
        other_retirement: 0,
        ss_self: data.ssi_annual_amount,
        ss_spouse: data.spouse_ssi_annual_amount ?? 0,
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
        date_of_birth: dateOfBirth,
        spouse_dob: spouseDob,
        life_expectancy: data.end_age,
      } as const;

      // @ts-ignore
      await updateClient.mutateAsync({ id: client.id, data: submitData });
      await recalculateProjection.mutateAsync(client.id);

    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  const formulaType = form.watch("blueprint_type") as FormulaType;

  const handleFormulaTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as FormulaType;
    const product = ALL_PRODUCTS[value];
    if (!product) return;

    form.setValue("blueprint_type", value);
    form.setValue("carrier_name", product.defaults.carrierName);
    form.setValue("product_name", product.defaults.productName);
    form.setValue("bonus_percent", product.defaults.bonus);
    form.setValue("surrender_years", product.defaults.surrenderYears);
    form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
    form.setValue("rate_of_return", product.defaults.rateOfReturn);
  };

  return (
    <div className="flex flex-col h-full text-white">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-7 py-5 border-b border-[rgba(255,255,255,0.07)] shrink-0">
        <span className="text-base font-medium">Scenario Inputs</span>
        <button
          onClick={onClose}
          className="text-[rgba(255,255,255,0.25)] hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Formula Type Selector */}
      <div className="px-7 py-4 border-b border-[rgba(255,255,255,0.07)] shrink-0">
        <label className="block text-xs uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] mb-2">
          Formula Type
        </label>
        <select
          value={formulaType}
          onChange={handleFormulaTypeChange}
          className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-sm h-10 rounded-lg px-3 text-white focus:ring-1 focus:ring-gold focus:border-[rgba(212,175,55,0.3)] outline-none transition-colors"
        >
          <optgroup label="Growth">
            {Object.values(GROWTH_PRODUCTS).map((product) => (
              <option key={product.id} value={product.id}>
                {product.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Guaranteed Income">
            {Object.values(GUARANTEED_INCOME_PRODUCTS).map((product) => (
              <option key={product.id} value={product.id}>
                {product.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Form Sections */}
      <div className="flex-1 overflow-y-auto px-7 py-5">
        <FormProvider {...form}>
          <form
            id="formula-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className={cn(
              "space-y-6",
              // Force stacked layout
              "[&_.grid]:!grid-cols-1 [&_.grid]:gap-3",
              "[&_[class*='col-span']]:!col-span-1",
              // Styles - improved readability
              "[&_label]:text-sm [&_label]:font-normal [&_label]:text-[rgba(255,255,255,0.6)] [&_label]:mb-1.5",
              "[&_input]:bg-[rgba(255,255,255,0.04)] [&_input]:border-[rgba(255,255,255,0.1)] [&_input]:h-10 [&_input]:text-sm [&_input]:text-white [&_input]:rounded-lg [&_input]:px-3.5",
              "[&_input:focus]:border-[rgba(212,175,55,0.4)] [&_input:focus]:ring-0",
              "[&_button[role=combobox]]:bg-[rgba(255,255,255,0.04)] [&_button[role=combobox]]:border-[rgba(255,255,255,0.1)] [&_button[role=combobox]]:h-10 [&_button[role=combobox]]:text-sm [&_button[role=combobox]]:text-white [&_button[role=combobox]]:rounded-lg [&_button[role=combobox]]:px-3.5",
              "[&_[data-slot=select-trigger]]:bg-[rgba(255,255,255,0.04)] [&_[data-slot=select-trigger]]:border-[rgba(255,255,255,0.1)] [&_[data-slot=select-trigger]]:h-10 [&_[data-slot=select-trigger]]:text-sm [&_[data-slot=select-trigger]]:text-white [&_[data-slot=select-trigger]]:w-full",
              // Section headers - improved readability
              "[&_h3]:text-xs [&_h3]:font-medium [&_h3]:uppercase [&_h3]:tracking-[1.5px] [&_h3]:text-[rgba(255,255,255,0.5)] [&_h3]:border-b [&_h3]:border-[rgba(255,255,255,0.1)] [&_h3]:pb-2 [&_h3]:mb-4",
              "[&_p]:text-xs [&_p]:text-[rgba(255,255,255,0.4)]"
            )}
          >
            <ClientDataSection />
            <CurrentAccountSection />
            <NewAccountSection />
            <TaxDataSection />
            <TaxableIncomeSection />
            <ConversionSection />
            <RothWithdrawalsSection />
            <AdvancedDataSection />
          </form>
        </FormProvider>
      </div>

      {/* Footer */}
      <div className="px-7 py-5 border-t border-[rgba(255,255,255,0.07)] shrink-0">
        <button
          onClick={form.handleSubmit(onSubmit)}
          className="w-full h-11 bg-gold hover:bg-[rgba(212,175,55,0.9)] text-[#0c0c0c] font-semibold text-sm rounded-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          disabled={isPending}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Updating..." : "Update Scenario"}
        </button>
      </div>
    </div>
  );
}

function mapConversionTypeToStrategy(conversionType: string) {
  switch (conversionType) {
    case "optimized_amount": return "moderate";
    case "fixed_amount": return "conservative";
    case "full_conversion": return "aggressive";
    case "no_conversion": return "conservative";
    default: return "moderate";
  }
}
