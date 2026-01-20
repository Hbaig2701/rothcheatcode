"use client";

import { useForm, FormProvider, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientBlueprintSchema, type ClientFormData } from "@/lib/validations/client";
import { useUpdateClient } from "@/lib/queries/clients";
import { useRecalculateProjection } from "@/lib/queries/projections";
import { useSmartDefaults } from "@/hooks/use-smart-defaults";
import type { Client } from "@/lib/types/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Import Sections
import { ClientDataSection } from "@/components/clients/sections/client-data";
import { CurrentAccountSection } from "@/components/clients/sections/current-account";
import { NewAccountSection } from "@/components/clients/sections/new-account";
import { TaxDataSection } from "@/components/clients/sections/tax-data";
import { TaxableIncomeSection } from "@/components/clients/sections/taxable-income";
import { ConversionSection } from "@/components/clients/sections/conversion";
import { RothWithdrawalsSection } from "@/components/clients/sections/roth-withdrawals";
import { AdvancedDataSection } from "@/components/clients/sections/advanced-data";

interface InputSidebarProps {
    client: Client;
}

export function InputSidebar({ client }: InputSidebarProps) {
    const updateClient = useUpdateClient();
    const recalculateProjection = useRecalculateProjection();

    const form = useForm<ClientFormData>({
        resolver: zodResolver(clientBlueprintSchema) as Resolver<ClientFormData>,
        defaultValues: {
            // Mapping existing client data to form defaults
            filing_status: client?.filing_status ?? "married_filing_jointly",
            name: client?.name ?? "",
            age: client?.age ?? 62,
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
            non_ssi_income: client?.non_ssi_income ?? [],
            conversion_type: client?.conversion_type ?? "optimized_amount",
            protect_initial_premium: client?.protect_initial_premium ?? true,
            withdrawal_type: client?.withdrawal_type ?? "no_withdrawals",
            surrender_years: client?.surrender_years ?? 7,
            penalty_free_percent: client?.penalty_free_percent ?? 10,
            baseline_comparison_rate: client?.baseline_comparison_rate ?? 7,
            post_contract_rate: client?.post_contract_rate ?? 7,
            years_to_defer_conversion: client?.years_to_defer_conversion ?? 0,
            end_age: client?.end_age ?? 100,
            heir_tax_rate: client?.heir_tax_rate ?? 40,
            widow_analysis: client?.widow_analysis ?? false,
            taxable_accounts: client?.taxable_accounts ?? 0,
            roth_ira: client?.roth_ira ?? 0,
        },
    });

    // useSmartDefaults(form); // Optional: disable specific defaults if they conflict with "edit" mode

    const isPending = updateClient.isPending || recalculateProjection.isPending;

    const onSubmit = async (data: ClientFormData) => {
        try {
            const currentYear = new Date().getFullYear();
            const birthYear = currentYear - data.age;
            const dateOfBirth = `${birthYear}-01-01`;

            let spouseDob = null;
            if (data.filing_status === "married_filing_jointly" || data.filing_status === "married_filing_separately") {
                spouseDob = dateOfBirth;
            }

            const submitData = {
                ...data,
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
                date_of_birth: dateOfBirth,
                spouse_dob: spouseDob,
                life_expectancy: data.end_age,
            } as const;

            // 1. Update Client
            // @ts-ignore - Strategy string literal issue
            await updateClient.mutateAsync({ id: client.id, data: submitData });

            // 2. Recalculate Projection
            await recalculateProjection.mutateAsync(client.id);

        } catch (error) {
            console.error("Form submission error:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e293b] border-r border-[#334155] text-slate-100 dark">
            {/* Sidebar Header Dropdown Area */}
            <div className="p-3 border-b border-[#334155] space-y-2">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-tighter">Homer's Blueprint</h2>
                <select className="w-full bg-[#0f172a] border border-[#334155] text-xs h-7 rounded px-2 text-slate-300">
                    <option>Mr.</option>
                </select>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                <FormProvider {...form}>
                    <form id="blueprint-form" onSubmit={form.handleSubmit(onSubmit)}
                        className={cn(
                            "space-y-4",
                            "[&_.space-y-4]:space-y-2", // Compress sections
                            "[&_label]:text-[10px] [&_label]:text-slate-400 [&_label]:uppercase [&_label]:tracking-wide", // Smaller labels
                            "[&_input]:bg-[#0f172a] [&_input]:border-[#334155] [&_input]:h-7 [&_input]:text-xs [&_input]:text-slate-200", // Dark compact inputs
                            "[&_button[role=combobox]]:bg-[#0f172a] [&_button[role=combobox]]:border-[#334155] [&_button[role=combobox]]:h-7 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:text-slate-200", // Select triggers
                            "[&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-slate-500 [&_h3]:border-b [&_h3]:border-[#334155] [&_h3]:pb-1" // Section headers
                        )}>

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

            <div className="p-3 border-t border-[#334155] bg-[#1e293b]">
                <Button
                    onClick={form.handleSubmit(onSubmit)}
                    className="w-full bg-[#71a02d] hover:bg-[#5d8524] text-white font-bold h-9 uppercase text-xs tracking-wide shadow-md"
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isPending ? "Calculating..." : "Submit"}
                </Button>
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
