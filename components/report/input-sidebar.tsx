"use client";

import { useEffect, useState } from "react";
import { useForm, FormProvider, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientFormulaSchema, type ClientFormData } from "@/lib/validations/client";
import { useUpdateClient } from "@/lib/queries/clients";
import { useRecalculateProjection } from "@/lib/queries/projections";
import type { Client } from "@/lib/types/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROWTH_PRODUCTS, GUARANTEED_INCOME_PRODUCTS, ALL_PRODUCTS, type FormulaType, type GuaranteedIncomeFormulaType } from "@/lib/config/products";
import { useProducts } from "@/lib/queries/products";
import { GI_PRODUCT_DATA } from "@/lib/config/gi-product-data";
import type { CustomProductRow } from "@/lib/products/types";

// Import Sections
import { ClientDataSection } from "@/components/clients/sections/client-data";
import { CurrentAccountSection } from "@/components/clients/sections/current-account";
import { NewAccountSection } from "@/components/clients/sections/new-account";
import { TaxDataSection } from "@/components/clients/sections/tax-data";
import { TaxableIncomeSection } from "@/components/clients/sections/taxable-income";
import { ConversionSection } from "@/components/clients/sections/conversion";
import { AumAllocationSection } from "@/components/clients/sections/aum-allocation";
import { RothWithdrawalsSection } from "@/components/clients/sections/roth-withdrawals";
import { AdvancedDataSection } from "@/components/clients/sections/advanced-data";

interface InputSidebarProps {
    client: Client;
}

export function InputSidebar({ client }: InputSidebarProps) {
    const updateClient = useUpdateClient();
    const recalculateProjection = useRecalculateProjection();

    const form = useForm<ClientFormData>({
        resolver: zodResolver(clientFormulaSchema) as Resolver<ClientFormData>,
        defaultValues: {
            blueprint_type: client?.blueprint_type ?? "fia",
            custom_product_id: client?.custom_product_id ?? null,
            // Match the main form: no silent age/filing defaults (see input-drawer).
            filing_status: client?.filing_status ?? "single",
            name: client?.name ?? "",
            age: client?.age ?? undefined,
            spouse_name: client?.spouse_name ?? "",
            spouse_age: client?.spouse_age ?? undefined,

            qualified_account_value: client?.qualified_account_value ?? 0,
            carrier_name: client?.carrier_name ?? "Generic Carrier",
            product_name: client?.product_name ?? "Generic Product",
            bonus_percent: client?.bonus_percent ?? 10,
            rate_of_return: client?.rate_of_return ?? 7,
            state: client?.state ?? "CA",
            constraint_type: client?.constraint_type ?? "bracket_ceiling",
            target_irmaa_tier: client?.target_irmaa_tier ?? "standard",
            tax_rate: client?.tax_rate ?? 24,
            max_tax_rate: client?.max_tax_rate ?? 24,
            tax_payment_source: client?.tax_payment_source ?? "from_taxable",
            state_tax_rate: client?.state_tax_rate ?? null,
            // Load the saved value — without this the editor shows it empty and
            // OVERWRITES the saved deduction with null on every scenario save.
            additional_deductions: client?.additional_deductions ?? null,

            ssi_payout_age: client?.ssi_payout_age ?? 67,
            ssi_annual_amount: client?.ssi_annual_amount ?? 2400000,
            spouse_ssi_payout_age: client?.spouse_ssi_payout_age ?? 67,
            spouse_ssi_annual_amount: client?.spouse_ssi_annual_amount ?? 0,

            non_ssi_income: client?.non_ssi_income ?? [],
            withdrawals: client?.withdrawals ?? [],
            conversion_type: client?.conversion_type ?? "optimized_amount",
            fixed_conversion_amount: client?.fixed_conversion_amount ?? null,
            target_partial_amount: client?.target_partial_amount ?? null,
            // AUM split-allocation defaults — 0 means feature off.
            aum_allocation_percent: client?.aum_allocation_percent ?? 0,
            aum_fee_percent: client?.aum_fee_percent ?? 1,
            aum_dividend_yield: client?.aum_dividend_yield ?? 2,
            aum_turnover_percent: client?.aum_turnover_percent ?? 10,
            aum_withdrawal_years: client?.aum_withdrawal_years ?? 5,
            aum_growth_rate: client?.aum_growth_rate ?? null,
            ltcg_rate: client?.ltcg_rate ?? 15,
            protect_initial_premium: client?.protect_initial_premium ?? true,
            withdrawal_type: client?.withdrawal_type ?? "no_withdrawals",
            payout_type: client?.payout_type ?? "individual",
            income_start_age: client?.income_start_age ?? 65,
            guaranteed_rate_of_return: client?.guaranteed_rate_of_return ?? 0,
            roll_up_option: client?.roll_up_option ?? null,
            payout_option: client?.payout_option ?? null,
            surrender_years: client?.surrender_years ?? 7,
            penalty_free_percent: client?.penalty_free_percent ?? 10,
            // Both penalty-free fields must be initialized so the
            // TaxDataSection's Controllers render with the correct value and
            // a save through the sidebar persists the user's choice.
            respect_penalty_free_limit: client?.respect_penalty_free_limit ?? false,
            penalty_free_scope: client?.penalty_free_scope ?? "tax_only",
            baseline_comparison_rate: client?.baseline_comparison_rate ?? 7,
            post_contract_rate: client?.post_contract_rate ?? 7,
            years_to_defer_conversion: client?.years_to_defer_conversion ?? 0,
            end_age: client?.end_age ?? 100,
            heir_tax_rate: client?.heir_tax_rate ?? 40,
            widow_analysis: client?.widow_analysis ?? false,
            widow_death_age: client?.widow_death_age ?? null,
            surrender_schedule: client?.surrender_schedule ?? null,
            taxable_accounts: client?.taxable_accounts ?? 0,
            roth_ira: client?.roth_ira ?? 0,
        },
    });

    const isPending = updateClient.isPending || recalculateProjection.isPending;
    const [submitErrors, setSubmitErrors] = useState<string[]>([]);

    // Sync form fields with formula type defaults on load.
    //
    // Only runs for system presets. Custom products own their bonus/carrier/product
    // values — clobbering them here is what caused the "bonus keeps reverting to
    // the engine preset's default" bug.
    useEffect(() => {
        if (form.getValues("custom_product_id")) return;

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
        setSubmitErrors([]);
        try {
            // Filter out any invalid/ghost income entries
            if (data.non_ssi_income) {
                data.non_ssi_income = data.non_ssi_income.filter(
                    (entry) => entry.year && !Number.isNaN(entry.year) && entry.year >= 2024
                );
            }

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
            setSubmitErrors([error instanceof Error ? error.message : "Failed to update scenario"]);
        }
    };

    const onValidationError = (errors: Record<string, unknown>) => {
        console.error("Input sidebar validation errors:", errors);
        const messages: string[] = [];
        const walk = (node: unknown, path: string[] = []) => {
            if (!node || typeof node !== "object") return;
            const obj = node as Record<string, unknown>;
            if (typeof obj.message === "string") {
                const label = path.join(".") || "form";
                messages.push(`${label}: ${obj.message}`);
                return;
            }
            for (const key of Object.keys(obj)) {
                walk(obj[key], [...path, key]);
            }
        };
        walk(errors);
        setSubmitErrors(messages.length ? messages : ["Form is invalid — check the highlighted fields."]);
    };

    // Watch formula type for header display
    const formulaType = form.watch("blueprint_type") as FormulaType;
    const customProductId = form.watch("custom_product_id");
    const currentProduct = ALL_PRODUCTS[formulaType];

    // Pull custom products so this picker mirrors the main NewAccountSection picker
    const { data: productsData } = useProducts();
    const customProducts: CustomProductRow[] = productsData?.customDetailed ?? [];
    const selectedCustom = customProductId
        ? customProducts.find((p) => p.id === customProductId) ?? null
        : null;

    const SYSTEM_PREFIX = "system:";
    const CUSTOM_PREFIX = "custom:";
    const pickerValue = customProductId
        ? `${CUSTOM_PREFIX}${customProductId}`
        : `${SYSTEM_PREFIX}${formulaType}`;

    const applyCustom = (product: CustomProductRow) => {
        const cfg = product.config;
        const sa = cfg.state_availability ?? null;
        const clientState = (form.getValues("state") ?? "").toUpperCase();
        const bonusPct = (sa?.bonus_overrides?.[clientState] as number | undefined) ?? cfg.bonus.percentage;
        const surrenderSchedule =
            (sa?.surrender_overrides?.[clientState] as number[] | undefined) ?? cfg.surrender.schedule;

        form.setValue("custom_product_id", product.id);
        form.setValue("blueprint_type", product.engine_preset);
        form.setValue("carrier_name", product.carrier_name ?? product.name);
        form.setValue("product_name", product.carrier_product_name ?? product.name);
        form.setValue("bonus_percent", bonusPct);
        form.setValue("surrender_years", cfg.surrender.years);
        form.setValue("penalty_free_percent", cfg.withdrawals.penalty_free_percent);
        form.setValue("rate_of_return", cfg.form_defaults?.rate_of_return ?? 7);
        form.setValue("anniversary_bonus_percent", cfg.bonus.anniversary_rate ?? null);
        form.setValue("anniversary_bonus_years", cfg.bonus.anniversary_years ?? null);
        form.setValue("surrender_schedule", surrenderSchedule.length ? surrenderSchedule : null);

        const giData = GI_PRODUCT_DATA[product.engine_preset as GuaranteedIncomeFormulaType];
        if (giData) {
            form.setValue("roll_up_option", giData.hasRollUpOptions && giData.rollUp.defaultOption
                ? (giData.rollUp.defaultOption as "simple" | "compound")
                : null);
            form.setValue("payout_option", giData.hasDualPayoutOption ? "level" : null);
        } else {
            form.setValue("roll_up_option", null);
            form.setValue("payout_option", null);
        }
    };

    // Handle formula type change from header dropdown
    const handleFormulaTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const encoded = e.target.value;
        if (encoded.startsWith(CUSTOM_PREFIX)) {
            const id = encoded.slice(CUSTOM_PREFIX.length);
            const cp = customProducts.find((p) => p.id === id);
            if (cp) applyCustom(cp);
            return;
        }
        const value = encoded.startsWith(SYSTEM_PREFIX)
            ? (encoded.slice(SYSTEM_PREFIX.length) as FormulaType)
            : (encoded as FormulaType);
        const product = ALL_PRODUCTS[value];
        if (!product) return;

        // Selecting a system preset clears any custom-product link
        form.setValue("custom_product_id", null);
        form.setValue("blueprint_type", value);
        form.setValue("carrier_name", product.defaults.carrierName);
        form.setValue("product_name", product.defaults.productName);
        form.setValue("bonus_percent", product.defaults.bonus);
        form.setValue("surrender_years", product.defaults.surrenderYears);
        form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
        form.setValue("rate_of_return", product.defaults.rateOfReturn);
    };

    const customGrowth = customProducts.filter((p) => p.category === "growth");
    const customIncome = customProducts.filter((p) => p.category === "income");

    return (
        <div className="flex flex-col h-full bg-surface border-r border-border-default text-foreground">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-border-default bg-[#0A0A0A] shrink-0 space-y-2">
                <h2 className="text-xs font-bold text-[#F5B800] uppercase tracking-widest">Inputs</h2>
                <select
                    value={pickerValue}
                    onChange={handleFormulaTypeChange}
                    className="w-full bg-surface border border-border-default text-xs h-8 rounded px-3 text-foreground focus:ring-1 focus:ring-[#F5B800] outline-none"
                >
                    <optgroup label="Growth">
                        {Object.values(GROWTH_PRODUCTS).map((product) => (
                            <option key={product.id} value={`${SYSTEM_PREFIX}${product.id}`}>
                                {product.label}
                            </option>
                        ))}
                        {customGrowth.map((p) => (
                            <option key={p.id} value={`${CUSTOM_PREFIX}${p.id}`}>
                                ✨ {p.name} (yours)
                            </option>
                        ))}
                    </optgroup>
                    <optgroup label="Guaranteed Income">
                        {Object.values(GUARANTEED_INCOME_PRODUCTS).map((product) => (
                            <option key={product.id} value={`${SYSTEM_PREFIX}${product.id}`}>
                                {product.label}
                            </option>
                        ))}
                        {customIncome.map((p) => (
                            <option key={p.id} value={`${CUSTOM_PREFIX}${p.id}`}>
                                ✨ {p.name} (yours)
                            </option>
                        ))}
                    </optgroup>
                </select>
            </div>

            {/* Main Form Area - Stacked, Readable, Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[#3A3A3A] scrollbar-track-transparent">
                <FormProvider {...form}>
                    <form id="formula-form" onSubmit={form.handleSubmit(onSubmit, onValidationError)}
                        className={cn(
                            "space-y-6",

                            // Force Stacked Layout
                            "[&_.grid]:!grid-cols-1 [&_.grid]:gap-3",

                            // Remove col-span classes that break layout in narrow sidebar
                            "[&_[class*='col-span']]:!col-span-1",

                            // Labels — brighter so older advisors can scan input names quickly.
                            "[&_label]:!text-xs [&_label]:!font-semibold [&_label]:!text-foreground/85 [&_label]:!uppercase [&_label]:!tracking-wide [&_label]:!mb-1.5",
                            // Inputs — theme-aware card elevation. Light mode
                            // uses white bg + slate-300 border (visible against
                            // the cream sidebar). Dark mode uses white/8% wash +
                            // brighter border (visible against near-black).
                            "[&_input:not([type=radio]):not([type=checkbox])]:!bg-white [&_input:not([type=radio]):not([type=checkbox])]:!border [&_input:not([type=radio]):not([type=checkbox])]:!border-slate-300 [&_input:not([type=radio]):not([type=checkbox])]:!h-8 [&_input:not([type=radio]):not([type=checkbox])]:!text-xs [&_input:not([type=radio]):not([type=checkbox])]:!font-medium [&_input:not([type=radio]):not([type=checkbox])]:!text-foreground [&_input:not([type=radio]):not([type=checkbox])]:!rounded-md [&_input:not([type=radio]):not([type=checkbox])]:!px-2.5 [&_input:not([type=radio]):not([type=checkbox])]:!shadow-sm",
                            "dark:[&_input:not([type=radio]):not([type=checkbox])]:!bg-white/[0.08] dark:[&_input:not([type=radio]):not([type=checkbox])]:!border-white/[0.18] dark:[&_input:not([type=radio]):not([type=checkbox])]:!shadow-none",
                            "[&_input::placeholder]:!text-foreground/45",
                            "[&_input:hover]:!bg-slate-50 [&_input:hover]:!border-slate-400",
                            "dark:[&_input:hover]:!bg-white/[0.10] dark:[&_input:hover]:!border-white/[0.24]",
                            "[&_input:focus]:!bg-white [&_input:focus]:!border-[#F5B800] [&_input:focus]:!ring-1 [&_input:focus]:!ring-[#F5B800]/30",
                            "dark:[&_input:focus]:!bg-white/[0.10]",
                            "[&_input:not([type=radio]):not([type=checkbox])]:transition-colors",
                            // Comboboxes / Select triggers.
                            "[&_button[role=combobox]]:!bg-white [&_button[role=combobox]]:!border [&_button[role=combobox]]:!border-slate-300 [&_button[role=combobox]]:!h-8 [&_button[role=combobox]]:!text-xs [&_button[role=combobox]]:!font-medium [&_button[role=combobox]]:!text-foreground [&_button[role=combobox]]:!rounded-md [&_button[role=combobox]]:!px-2.5 [&_button[role=combobox]]:!shadow-sm",
                            "dark:[&_button[role=combobox]]:!bg-white/[0.08] dark:[&_button[role=combobox]]:!border-white/[0.18] dark:[&_button[role=combobox]]:!shadow-none",
                            "[&_button[role=combobox]:hover]:!bg-slate-50 [&_button[role=combobox]:hover]:!border-slate-400",
                            "dark:[&_button[role=combobox]:hover]:!bg-white/[0.10] dark:[&_button[role=combobox]:hover]:!border-white/[0.24]",
                            "[&_button[role=combobox]]:transition-colors",
                            "[&_[data-slot=select-trigger]]:!bg-white [&_[data-slot=select-trigger]]:!border [&_[data-slot=select-trigger]]:!border-slate-300 [&_[data-slot=select-trigger]]:!h-8 [&_[data-slot=select-trigger]]:!text-xs [&_[data-slot=select-trigger]]:!font-medium [&_[data-slot=select-trigger]]:!text-foreground [&_[data-slot=select-trigger]]:!w-full [&_[data-slot=select-trigger]]:!shadow-sm",
                            "dark:[&_[data-slot=select-trigger]]:!bg-white/[0.08] dark:[&_[data-slot=select-trigger]]:!border-white/[0.18] dark:[&_[data-slot=select-trigger]]:!shadow-none",
                            "[&_[data-slot=select-trigger]:hover]:!bg-slate-50 [&_[data-slot=select-trigger]:hover]:!border-slate-400",
                            "dark:[&_[data-slot=select-trigger]:hover]:!bg-white/[0.10] dark:[&_[data-slot=select-trigger]:hover]:!border-white/[0.24]",
                            "[&_[data-slot=select-trigger]]:transition-colors",

                            // Section headers — keep gold but with a clean divider.
                            "[&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-[#F5B800] [&_h3]:border-b [&_h3]:border-white/[0.08] [&_h3]:pb-1.5 [&_h3]:mb-3",

                            // Helper / description text — slightly brighter than the old #6B6B6B.
                            "[&_p]:text-xs [&_p]:text-foreground/55"
                        )}>

                        <ClientDataSection />
                        <CurrentAccountSection />
                        <NewAccountSection />
                        <TaxDataSection />
                        <TaxableIncomeSection />
                        <ConversionSection />
                        <AumAllocationSection />
                        <RothWithdrawalsSection />
                        <AdvancedDataSection />
                    </form>
                </FormProvider>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border-default bg-[#0A0A0A] shrink-0 space-y-3">
                {submitErrors.length > 0 && (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300 space-y-1 max-h-32 overflow-y-auto">
                        <p className="font-semibold text-red-200">Couldn&apos;t update scenario:</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                            {submitErrors.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                    </div>
                )}
                <Button
                    onClick={form.handleSubmit(onSubmit, onValidationError)}
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
        case "partial_amount": return "moderate";
        case "fixed_amount": return "conservative";
        case "full_conversion": return "aggressive";
        case "no_conversion": return "conservative";
        default: return "moderate";
    }
}
