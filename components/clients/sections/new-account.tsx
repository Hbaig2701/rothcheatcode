"use client";

import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { FormSection } from "@/components/clients/form-section";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GROWTH_PRODUCTS,
  GUARANTEED_INCOME_PRODUCTS,
  ALL_PRODUCTS,
  isFieldLocked,
  isGuaranteedIncomeProduct,
  type FormulaType,
} from "@/lib/config/products";
import { GI_PRODUCT_DATA } from "@/lib/config/gi-product-data";
import type { GuaranteedIncomeFormulaType } from "@/lib/config/products";
import { Lock, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProducts } from "@/lib/queries/products";
import { ARCHETYPE_LABELS } from "@/lib/products/types";
import type { CustomProductRow, ProductArchetype } from "@/lib/products/types";

// Encoded picker value: "system:<formula>" or "custom:<uuid>"
const SYSTEM = "system:";
const CUSTOM = "custom:";

interface ExtendedFormData extends ClientFormData {
  custom_product_id?: string | null;
}

export function NewAccountSection() {
  const form = useFormContext<ExtendedFormData>();
  const formulaType = form.watch("blueprint_type") as FormulaType;
  const customProductId = form.watch("custom_product_id");
  const { data: productsData } = useProducts();
  const customProducts: CustomProductRow[] = productsData?.customDetailed ?? [];

  const pickerValue = customProductId
    ? `${CUSTOM}${customProductId}`
    : `${SYSTEM}${formulaType}`;

  const handlePickerChange = (encoded: string | null) => {
    if (!encoded) return;
    if (encoded.startsWith(SYSTEM)) {
      const sys = encoded.slice(SYSTEM.length) as FormulaType;
      form.setValue("custom_product_id", null);
      handleFormulaTypeChange(sys);
    } else if (encoded.startsWith(CUSTOM)) {
      const id = encoded.slice(CUSTOM.length);
      const product = customProducts.find((p) => p.id === id);
      if (!product) return;
      applyCustomProduct(product);
    }
  };

  const applyCustomProduct = (product: CustomProductRow, overrideState?: string) => {
    const cfg = product.config;
    const sa = cfg.state_availability ?? null;
    const clientState = (overrideState ?? form.getValues("state") ?? "").toUpperCase();

    // Resolve state-specific overrides (fall back to base values)
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

    // Sync GI defaults from the engine_preset (custom products use system GI internals)
    const giData = GI_PRODUCT_DATA[product.engine_preset as GuaranteedIncomeFormulaType];
    if (giData) {
      if (giData.hasRollUpOptions && giData.rollUp.defaultOption) {
        form.setValue("roll_up_option", giData.rollUp.defaultOption as "simple" | "compound");
      } else {
        form.setValue("roll_up_option", null);
      }
      form.setValue("payout_option", giData.hasDualPayoutOption ? "level" : null);
    } else {
      form.setValue("roll_up_option", null);
      form.setValue("payout_option", null);
    }
  };

  // Re-apply state-specific overrides when client state changes (only if a custom product is selected)
  const watchedState = form.watch("state");
  useEffect(() => {
    if (!customProductId) return;
    const product = customProducts.find((p) => p.id === customProductId);
    if (!product) return;
    const sa = product.config.state_availability;
    if (!sa) return;
    const clientState = (watchedState ?? "").toUpperCase();
    const stateBonus = sa.bonus_overrides?.[clientState];
    const stateSurrender = sa.surrender_overrides?.[clientState];
    if (stateBonus != null) form.setValue("bonus_percent", stateBonus);
    if (stateSurrender) form.setValue("surrender_schedule", stateSurrender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedState, customProductId]);

  // Compute state-aware notice for UI
  const stateNotice = (() => {
    if (!customProductId) return null;
    const product = customProducts.find((p) => p.id === customProductId);
    const sa = product?.config.state_availability;
    if (!sa || !watchedState) return null;
    const st = watchedState.toUpperCase();
    if ((sa.not_available ?? []).includes(st)) {
      return { type: "error" as const, msg: `${product!.name} is not available in ${st}.` };
    }
    const hasBonus = sa.bonus_overrides?.[st] != null;
    const hasSurrender = sa.surrender_overrides?.[st] != null;
    const hasVesting = sa.vesting_overrides?.[st] != null;
    const hasMva = sa.mva_overrides?.[st] != null;
    if (hasBonus || hasSurrender || hasVesting || hasMva) {
      const parts = [];
      if (hasBonus) parts.push(`bonus: ${sa.bonus_overrides![st]}%`);
      if (hasSurrender) parts.push("custom surrender schedule");
      if (hasVesting) parts.push("custom vesting schedule");
      if (hasMva) parts.push("MVA override");
      return {
        type: "info" as const,
        msg: `Applied ${st} overrides — ${parts.join(", ")}.`,
      };
    }
    return null;
  })();

  // Handle formula type change - apply product defaults
  const handleFormulaTypeChange = (value: FormulaType | null) => {
    if (!value) return;
    const product = ALL_PRODUCTS[value];
    if (!product) return;

    // Selecting a system preset clears any custom product link
    form.setValue("custom_product_id", null);
    // Update form with new formula type and product defaults
    form.setValue("blueprint_type", value);
    form.setValue("carrier_name", product.defaults.carrierName);
    form.setValue("product_name", product.defaults.productName);
    form.setValue("bonus_percent", product.defaults.bonus);
    form.setValue("surrender_years", product.defaults.surrenderYears);
    form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
    form.setValue("rate_of_return", product.defaults.rateOfReturn);
    form.setValue("anniversary_bonus_percent", product.defaults.anniversaryBonus ?? null);
    form.setValue("anniversary_bonus_years", product.defaults.anniversaryBonusYears ?? null);
    form.setValue("surrender_schedule", product.defaults.surrenderSchedule ?? null);

    // Set GI-specific defaults when switching to a GI product
    const giData = GI_PRODUCT_DATA[value as GuaranteedIncomeFormulaType];
    if (giData) {
      // Set roll-up option default for products with selectable options
      if (giData.hasRollUpOptions && giData.rollUp.defaultOption) {
        form.setValue("roll_up_option", giData.rollUp.defaultOption as "simple" | "compound");
      } else {
        form.setValue("roll_up_option", null);
      }

      // Set payout option default for dual-payout products
      if (giData.hasDualPayoutOption) {
        form.setValue("payout_option", "level");
      } else {
        form.setValue("payout_option", null);
      }
    } else {
      // Switching to a Growth product - clear GI-specific fields
      form.setValue("roll_up_option", null);
      form.setValue("payout_option", null);
    }

    // Anniversary bonus fields are already set above from product defaults
    // (null for products without anniversary bonus, populated for Phased Bonus Growth)
  };

  const isCarrierLocked = isFieldLocked("carrierName", formulaType);
  const isProductLocked = isFieldLocked("productName", formulaType);
  const isBonusLocked = isFieldLocked("bonus", formulaType);
  const isGI = isGuaranteedIncomeProduct(formulaType);

  // Get product-specific GI data for conditional fields
  const giData = isGI ? GI_PRODUCT_DATA[formulaType as GuaranteedIncomeFormulaType] : null;

  return (
    <FormSection title="3. New Account Data" description="Insurance product details">
      {/* Product Preset Dropdown */}
      <Controller
        name="blueprint_type"
        control={form.control}
        render={() => {
          const selectedProduct = ALL_PRODUCTS[formulaType];
          const selectedCustom = customProductId
            ? customProducts.find((p) => p.id === customProductId)
            : null;
          const customGrowth = customProducts.filter((p) => p.category === "growth");
          const customIncome = customProducts.filter((p) => p.category === "income");
          const favorites = customProducts.filter((p) => p.is_favorite);
          return (
            <Field>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor="blueprint_type">Product Preset</FieldLabel>
                <a
                  href="https://docs.google.com/document/d/1no9bs58mgqS97Bw_19pOoslGoALP0lz6/edit?usp=sharing&ouid=106247356235746651631&rtpof=true&sd=true"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  See our Preset List
                </a>
                <a
                  href="/settings#products"
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  + Manage your products
                </a>
              </div>
              <Select value={pickerValue} onValueChange={handlePickerChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select product preset">
                    {selectedCustom ? (
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-primary" />
                        {selectedCustom.name}
                      </span>
                    ) : (
                      selectedProduct?.label ?? "Select product preset"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {favorites.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Favorites</SelectLabel>
                      {favorites.map((p) => (
                        <SelectItem key={`fav-${p.id}`} value={`${CUSTOM}${p.id}`}>
                          <span className="flex items-center gap-1.5">
                            <Star className="size-3 fill-yellow-500 text-yellow-500" />
                            {p.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel>Growth</SelectLabel>
                    {Object.values(GROWTH_PRODUCTS).map((product) => (
                      <SelectItem key={product.id} value={`${SYSTEM}${product.id}`}>
                        {product.label}
                      </SelectItem>
                    ))}
                    {customGrowth.map((p) => (
                      <SelectItem key={p.id} value={`${CUSTOM}${p.id}`}>
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="size-3 text-primary/70" />
                          {p.name}
                          <span className="text-xs text-muted-foreground">(yours)</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Guaranteed Income</SelectLabel>
                    {Object.values(GUARANTEED_INCOME_PRODUCTS).map((product) => (
                      <SelectItem key={product.id} value={`${SYSTEM}${product.id}`}>
                        {product.label}
                      </SelectItem>
                    ))}
                    {customIncome.map((p) => (
                      <SelectItem key={p.id} value={`${CUSTOM}${p.id}`}>
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="size-3 text-primary/70" />
                          {p.name}
                          <span className="text-xs text-muted-foreground">(yours)</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  {/* AUM - future phase, disabled */}
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground/60">
                      AUM (Coming Soon)
                    </SelectLabel>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {selectedCustom
                  ? `${ARCHETYPE_LABELS[selectedCustom.archetype as ProductArchetype] ?? selectedCustom.archetype} · runs on ${selectedProduct?.label ?? formulaType} engine`
                  : ALL_PRODUCTS[formulaType]?.description || "Select a product template"}
              </FieldDescription>
              {stateNotice && (
                <div
                  className={`mt-2 rounded-md px-3 py-2 text-xs ${
                    stateNotice.type === "error"
                      ? "border border-red-300/40 bg-red-50/30 text-red-700 dark:bg-red-950/20 dark:text-red-400"
                      : "border border-primary/30 bg-primary/5 text-primary"
                  }`}
                >
                  {stateNotice.msg}
                </div>
              )}
              <p className="text-xs text-muted-foreground/60 mt-2 leading-relaxed">
                The product archetypes shown are for illustrative purposes only. They represent general categories of fixed index annuity features. Actual product features, rates, and terms vary by carrier and state. Always verify with official carrier illustrations before presenting to clients.
              </p>
            </Field>
          );
        }}
      />

      {/* Carrier Name */}
      <Field data-invalid={!!form.formState.errors.carrier_name}>
        <FieldLabel htmlFor="carrier_name" className="flex items-center gap-1.5">
          Carrier Name
          {isCarrierLocked && <Lock className="size-3 text-muted-foreground" />}
        </FieldLabel>
        <Input
          id="carrier_name"
          {...form.register("carrier_name")}
          aria-invalid={!!form.formState.errors.carrier_name}
          disabled={isCarrierLocked}
          className={cn(isCarrierLocked && "opacity-60 cursor-not-allowed bg-muted/30")}
        />
        <FieldError errors={[form.formState.errors.carrier_name]} />
      </Field>

      {/* Product Name */}
      <Field data-invalid={!!form.formState.errors.product_name}>
        <FieldLabel htmlFor="product_name" className="flex items-center gap-1.5">
          Product Name
          {isProductLocked && <Lock className="size-3 text-muted-foreground" />}
        </FieldLabel>
        <Input
          id="product_name"
          {...form.register("product_name")}
          aria-invalid={!!form.formState.errors.product_name}
          disabled={isProductLocked}
          className={cn(isProductLocked && "opacity-60 cursor-not-allowed bg-muted/30")}
        />
        <FieldError errors={[form.formState.errors.product_name]} />
      </Field>

      {/* Bonus % */}
      <Controller
        name="bonus_percent"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="bonus_percent" className="flex items-center gap-1.5">
              Bonus %
              {isBonusLocked && <Lock className="size-3 text-muted-foreground" />}
            </FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
              disabled={isBonusLocked}
              className={cn(isBonusLocked && "opacity-60 cursor-not-allowed bg-muted/30")}
            />
            <FieldDescription>Premium bonus percentage (e.g., 10%)</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* Anniversary Bonus - Locked display for products with phased bonus */}
      {form.watch("anniversary_bonus_percent") != null && form.watch("anniversary_bonus_years") != null && (
        <Field>
          <FieldLabel className="flex items-center gap-1.5">
            Anniversary Bonus
            <Lock className="size-3 text-muted-foreground" />
          </FieldLabel>
          <Input
            value={`${form.watch("anniversary_bonus_percent")}% per year for ${form.watch("anniversary_bonus_years")} years`}
            disabled
            className="opacity-60 cursor-not-allowed bg-muted/30"
          />
          <FieldDescription>Applied to account value at each anniversary (in addition to premium bonus)</FieldDescription>
        </Field>
      )}

      {/* Surrender Schedule - Collapsible to save form real estate */}
      {form.watch("surrender_schedule") != null && (
        <Controller
          name="surrender_schedule"
          control={form.control}
          render={({ field }) => {
            const schedule = field.value as number[] | null;
            if (!schedule || schedule.length === 0) return <></>;
            return (
              <Field className="sm:col-span-2 lg:col-span-3">
                <details className="group border border-border rounded-lg bg-muted/30">
                  <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 text-sm font-medium select-none list-none [&::-webkit-details-marker]:hidden hover:bg-muted/60 rounded-lg transition-colors">
                    <span className="flex items-center gap-2">
                      Surrender Schedule
                      <span className="text-xs text-muted-foreground font-normal">
                        ({schedule.length} yrs)
                      </span>
                    </span>
                    <svg
                      className="size-4 text-foreground/60 transition-transform group-open:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="px-3 pb-3 pt-1 space-y-2">
                    <div className="grid grid-cols-5 gap-2">
                      {schedule.map((charge, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">Yr {idx + 1}</span>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={charge}
                            onChange={(e) => {
                              const newSchedule = [...schedule];
                              newSchedule[idx] = parseFloat(e.target.value) || 0;
                              field.onChange(newSchedule);
                            }}
                            className="text-center text-sm h-9 px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      ))}
                    </div>
                    <FieldDescription>Surrender charge % for each policy year (0% = no charge)</FieldDescription>
                  </div>
                </details>
              </Field>
            );
          }}
        />
      )}

      {/* Rider Fee - Locked display for GI products */}
      {isGI && giData && (
        <Field>
          <FieldLabel className="flex items-center gap-1.5">
            Annual Rider Fee
            <Lock className="size-3 text-muted-foreground" />
          </FieldLabel>
          <Input
            value={`${giData.riderFee.toFixed(2)}%`}
            disabled
            className="opacity-60 cursor-not-allowed bg-muted/30"
          />
          <FieldDescription>Deducted from Account Value annually</FieldDescription>
        </Field>
      )}

      {/* Rate of Return - Always editable */}
      <Controller
        name="rate_of_return"
        control={form.control}
        render={({ field: { ref, ...field }, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="rate_of_return">Rate of Return %</FieldLabel>
            <PercentInput
              {...field}
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>Expected annual return rate</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {/* GI-specific fields - only shown for Guaranteed Income products */}
      {isGI && (
        <>
          {/* Roll-Up Option - for products with selectable roll-up options */}
          {giData?.hasRollUpOptions && giData.rollUp.options && (
            <Controller
              name="roll_up_option"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="roll_up_option">Roll-Up Option</FieldLabel>
                  <Select
                    value={field.value ?? "simple"}
                    onValueChange={(v) => field.onChange(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {giData.rollUp.options!.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Determines how your Income Base grows during deferral
                  </FieldDescription>
                </Field>
              )}
            />
          )}

          {/* Payout Option - for products with dual payout option */}
          {giData?.hasDualPayoutOption && (
            <Controller
              name="payout_option"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="payout_option">Payout Option</FieldLabel>
                  <Select
                    value={field.value ?? "level"}
                    onValueChange={(v) => field.onChange(v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="level">Level LPA - Higher starting income, stays flat</SelectItem>
                      <SelectItem value="increasing">Increasing LPA - Lower starting, grows over time</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Level starts higher but stays flat; Increasing starts lower but can grow
                  </FieldDescription>
                </Field>
              )}
            />
          )}

          {/* Payout Type */}
          <Controller
            name="payout_type"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Payout Type</FieldLabel>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="individual"
                      checked={field.value === "individual"}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="text-sm">Individual</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="joint"
                      checked={field.value === "joint"}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="text-sm">Joint</span>
                  </label>
                </div>
                <FieldDescription>Individual or joint life payout option</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {/* Income Start Age */}
          <Field data-invalid={!!form.formState.errors.income_start_age}>
            <FieldLabel htmlFor="income_start_age">Income Start Age</FieldLabel>
            <Input
              id="income_start_age"
              type="number"
              min={55}
              max={80}
              {...form.register("income_start_age", { valueAsNumber: true })}
              aria-invalid={!!form.formState.errors.income_start_age}
            />
            <FieldDescription>Age when guaranteed income payments begin (55-80)</FieldDescription>
            <FieldError errors={[form.formState.errors.income_start_age]} />
          </Field>

          {/* GI Conversion Years */}
          <Field data-invalid={!!form.formState.errors.gi_conversion_years}>
            <FieldLabel htmlFor="gi_conversion_years">Years to Convert Before GI Purchase</FieldLabel>
            <Input
              id="gi_conversion_years"
              type="number"
              min={1}
              max={15}
              {...form.register("gi_conversion_years", { valueAsNumber: true })}
              aria-invalid={!!form.formState.errors.gi_conversion_years}
            />
            <FieldDescription>Number of years to convert Traditional IRA to Roth before purchasing GI (1-15)</FieldDescription>
            <FieldError errors={[form.formState.errors.gi_conversion_years]} />
          </Field>

          {/* GI Conversion Bracket */}
          <Controller
            name="gi_conversion_bracket"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Conversion Tax Bracket</FieldLabel>
                <Select
                  value={field.value?.toString() || "24"}
                  onValueChange={(val) => field.onChange(Number(val))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax bracket" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (fill to standard deduction only)</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="22">22%</SelectItem>
                    <SelectItem value="24">24%</SelectItem>
                    <SelectItem value="32">32%</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>Target tax bracket for Roth conversions during conversion phase. 0% = convert just enough to stay under the standard deduction (no federal tax).</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </>
      )}
    </FormSection>
  );
}
