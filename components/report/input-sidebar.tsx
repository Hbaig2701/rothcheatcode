"use client";

import { useForm, FormProvider, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientBlueprintSchema, type ClientFormData } from "@/lib/validations/client";
import { useUpdateClient } from "@/lib/queries/clients";
import { useRecalculateProjection } from "@/lib/queries/projections";
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

            // @ts-ignore
            await updateClient.mutateAsync({ id: client.id, data: submitData });
            await recalculateProjection.mutateAsync(client.id);

        } catch (error) {
            console.error("Form submission error:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e293b] border-r border-[#334155] text-slate-200">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-[#334155] bg-[#0f172a] shrink-0 space-y-2">
                <h2 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Inputs</h2>
                <select className="w-full bg-[#1e293b] border border-[#334155] text-xs h-8 rounded px-3 text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none">
                    <option>Standard Blueprint</option>
                </select>
            </div>

            {/* Main Form Area - Stacked, Readable, Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                <FormProvider {...form}>
                    <form id="blueprint-form" onSubmit={form.handleSubmit(onSubmit)}
                        className={cn(
                            "space-y-6", // Reasonable spacing between sections

                            // Force Stacked Layout
                            "[&_.grid]:grid-cols-1 [&_.grid]:gap-3", // Force all grids to 1 col with gap

                            // Styles
                            "[&_label]:text-[11px] [&_label]:font-semibold [&_label]:text-slate-400 [&_label]:uppercase [&_label]:tracking-wide [&_label]:mb-1.5",
                            "[&_input]:bg-[#0f172a] [&_input]:border-[#334155] [&_input]:h-8 [&_input]:text-xs [&_input]:text-slate-100 [&_input]:rounded-sm [&_input]:px-2.5",
                            "[&_input:focus]:border-emerald-500 [&_input:focus]:ring-0",
                            "[&_button[role=combobox]]:bg-[#0f172a] [&_button[role=combobox]]:border-[#334155] [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:text-slate-100 [&_button[role=combobox]]:rounded-sm [&_button[role=combobox]]:px-2.5",

                            // Headers
                            "[&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-emerald-500 [&_h3]:border-b [&_h3]:border-[#334155] [&_h3]:pb-1 [&_h3]:mb-3"
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

            {/* Footer */}
            <div className="p-4 border-t border-[#334155] bg-[#0f172a] shrink-0">
                <Button
                    onClick={form.handleSubmit(onSubmit)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 uppercase text-xs tracking-widest shadow-lg"
                    disabled={isPending}
                >
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isPending ? "Calculating..." : "Update"}
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
