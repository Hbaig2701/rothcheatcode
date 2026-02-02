"use client";

import { useEffect } from "react";
import { useForm, FormProvider, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientCheatCodeSchema, type ClientFormData } from "@/lib/validations/client";
import { useUpdateClient } from "@/lib/queries/clients";
import { useRecalculateProjection } from "@/lib/queries/projections";
import type { Client } from "@/lib/types/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROWTH_PRODUCTS, GUARANTEED_INCOME_PRODUCTS, ALL_PRODUCTS, type CheatCodeType } from "@/lib/config/products";

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
        resolver: zodResolver(clientCheatCodeSchema) as Resolver<ClientFormData>,
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

    // Sync form fields with cheatCode type defaults on load
    // This ensures consistency when loading data that may have mismatched values
    useEffect(() => {
        const cheatCodeType = form.getValues("blueprint_type") as CheatCodeType;
        const product = ALL_PRODUCTS[cheatCodeType];
        if (!product) return;

        const currentCarrier = form.getValues("carrier_name");
        const currentProduct = form.getValues("product_name");

        // Check if current values match a DIFFERENT locked product
        // If so, reset to the selected cheatCode type's defaults
        const otherProducts = Object.values(ALL_PRODUCTS).filter(p => p.id !== cheatCodeType);
        const matchesOtherLockedProduct = otherProducts.some(p =>
            p.lockedFields.includes("carrierName") &&
            p.defaults.carrierName === currentCarrier
        );

        if (matchesOtherLockedProduct) {
            // Current carrier matches a different locked product - reset to correct defaults
            form.setValue("carrier_name", product.defaults.carrierName);
            form.setValue("product_name", product.defaults.productName);
            form.setValue("bonus_percent", product.defaults.bonus);
            form.setValue("surrender_years", product.defaults.surrenderYears);
            form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
        }

        // For locked products, always ensure values match the preset
        if (product.lockedFields.includes("carrierName") && currentCarrier !== product.defaults.carrierName) {
            form.setValue("carrier_name", product.defaults.carrierName);
        }
        if (product.lockedFields.includes("productName") && currentProduct !== product.defaults.productName) {
            form.setValue("product_name", product.defaults.productName);
        }
    }, [form, client?.id]); // Re-run when client changes

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
                    spouseDob = dateOfBirth; // fallback
                }
            }

            const submitData = {
                ...data,
                traditional_ira: data.qualified_account_value,
                other_retirement: 0,
                ss_self: data.ssi_annual_amount,
                ss_spouse: data.spouse_ssi_annual_amount ?? 0,
                ss_start_age: data.ssi_payout_age,
                // We'll pass spouse fields in ...data, expecting backend to store them if schema matches
                // If backend schema is strict (legacy), extra fields might be ignored unless we updated DB types.
                // Assuming backend handles ...data or JSON blob.

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

    // Watch cheatCode type for header display
    const cheatCodeType = form.watch("blueprint_type") as CheatCodeType;
    const currentProduct = ALL_PRODUCTS[cheatCodeType];

    // Handle cheatCode type change from header dropdown
    const handleCheatCodeTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value as CheatCodeType;
        const product = ALL_PRODUCTS[value];
        if (!product) return;

        // Update form with new cheatCode type and product defaults
        form.setValue("blueprint_type", value);
        form.setValue("carrier_name", product.defaults.carrierName);
        form.setValue("product_name", product.defaults.productName);
        form.setValue("bonus_percent", product.defaults.bonus);
        form.setValue("surrender_years", product.defaults.surrenderYears);
        form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
        form.setValue("rate_of_return", product.defaults.rateOfReturn);
        if (product.defaults.guaranteedRateOfReturn !== undefined) {
            form.setValue("guaranteed_rate_of_return", product.defaults.guaranteedRateOfReturn);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#141414] border-r border-[#2A2A2A] text-white">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-[#2A2A2A] bg-[#0A0A0A] shrink-0 space-y-2">
                <h2 className="text-xs font-bold text-[#F5B800] uppercase tracking-widest">Inputs</h2>
                <select
                    value={cheatCodeType}
                    onChange={handleCheatCodeTypeChange}
                    className="w-full bg-[#141414] border border-[#2A2A2A] text-xs h-8 rounded px-3 text-white focus:ring-1 focus:ring-[#F5B800] outline-none"
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

            {/* Main Form Area - Stacked, Readable, Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[#3A3A3A] scrollbar-track-transparent">
                <FormProvider {...form}>
                    <form id="cheatcode-form" onSubmit={form.handleSubmit(onSubmit)}
                        className={cn(
                            "space-y-6",

                            // Force Stacked Layout
                            "[&_.grid]:!grid-cols-1 [&_.grid]:gap-3",

                            // Remove col-span classes that break layout in narrow sidebar
                            "[&_[class*='col-span']]:!col-span-1",

                            // Styles
                            "[&_label]:text-[11px] [&_label]:font-semibold [&_label]:text-[#A0A0A0] [&_label]:uppercase [&_label]:tracking-wide [&_label]:mb-1.5",
                            "[&_input]:bg-[#1A1A1A] [&_input]:border-[#3A3A3A] [&_input]:h-8 [&_input]:text-xs [&_input]:text-white [&_input]:rounded-sm [&_input]:px-2.5",
                            "[&_input:focus]:border-[#F5B800] [&_input:focus]:ring-0",
                            "[&_button[role=combobox]]:bg-[#1A1A1A] [&_button[role=combobox]]:border-[#3A3A3A] [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:text-white [&_button[role=combobox]]:rounded-sm [&_button[role=combobox]]:px-2.5",

                            // Select trigger styling for sidebar
                            "[&_[data-slot=select-trigger]]:bg-[#1A1A1A] [&_[data-slot=select-trigger]]:border-[#3A3A3A] [&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:text-xs [&_[data-slot=select-trigger]]:text-white [&_[data-slot=select-trigger]]:w-full",

                            // Headers
                            "[&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#F5B800] [&_h3]:border-b [&_h3]:border-[#2A2A2A] [&_h3]:pb-1 [&_h3]:mb-3",

                            // Description text
                            "[&_p]:text-[10px] [&_p]:text-[#6B6B6B]"
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
            <div className="p-4 border-t border-[#2A2A2A] bg-[#0A0A0A] shrink-0">
                <Button
                    onClick={form.handleSubmit(onSubmit)}
                    className="w-full bg-[#F5B800] hover:bg-[#DEAD00] text-black font-bold h-9 uppercase text-xs tracking-widest shadow-lg hover:shadow-[0_0_20px_rgba(245,184,0,0.3)] transition-all"
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
