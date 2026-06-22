"use client";

import { useEffect, useState } from "react";
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
import { FieldHelp } from "@/components/clients/field-help";
import { FIELD_HELP } from "@/lib/copy/field-help-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProductsTab } from "@/components/settings/tabs/products-tab";

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
  const { data: productsData, isLoading: isProductsLoading } = useProducts();
  const customProducts: CustomProductRow[] = productsData?.customDetailed ?? [];

  // A custom product the advisor picked before the products query resolved.
  // handlePickerChange can't apply it yet (the row isn't loaded), so we stash
  // the id and apply it via the effect below once the list arrives.
  const [pendingCustomId, setPendingCustomId] = useState<string | null>(null);
  // Opens the product-management Dialog centered over the client builder, so
  // the advisor can add/edit/adopt products without navigating away (which
  // would discard their in-progress client). The Dialog reuses the exact same
  // <ProductsTab/> from Settings; product mutations invalidate the shared
  // React Query cache, so the picker below repopulates live the moment a
  // product is created/edited/deleted — no refresh, no close required.
  const [manageOpen, setManageOpen] = useState(false);

  const pickerValue = customProductId
    ? `${CUSTOM}${customProductId}`
    : `${SYSTEM}${formulaType}`;

  const handlePickerChange = (encoded: string | null) => {
    if (!encoded) return;
    if (encoded.startsWith(SYSTEM)) {
      const sys = encoded.slice(SYSTEM.length) as FormulaType;
      form.setValue("custom_product_id", null);
      setPendingCustomId(null);
      handleFormulaTypeChange(sys);
    } else if (encoded.startsWith(CUSTOM)) {
      const id = encoded.slice(CUSTOM.length);
      const product = customProducts.find((p) => p.id === id);
      if (product) {
        applyCustomProduct(product);
      } else {
        // Products query hasn't resolved yet. Record the selection so the form
        // isn't left on the default preset (which would create the client with
        // a mismatched blueprint_type → broken projection); the effect below
        // applies the full product config the moment the list loads.
        form.setValue("custom_product_id", id);
        setPendingCustomId(id);
      }
    }
  };

  // Apply a race-condition custom pick once the products list arrives. Guarded
  // by pendingCustomId so this ONLY fires for a selection made before load —
  // it never re-runs on an already-loaded client and clobbers advisor edits.
  useEffect(() => {
    if (!pendingCustomId) return;
    const product = customProducts.find((p) => p.id === pendingCustomId);
    if (product) {
      applyCustomProduct(product);
      setPendingCustomId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCustomId, customProducts]);

  // If the selected custom product disappears from the list AFTER the products
  // query has settled — e.g. the advisor just deleted it from the Manage-
  // products dialog — clear the now-dangling custom_product_id. Otherwise the
  // form keeps a reference to a product that no longer exists: the picker shows
  // a stale name and a save could persist a broken link. Guarded on a settled,
  // present query and on no pending pre-load pick, so it never fires during the
  // edit/duplicate load race (where custom_product_id is set before the list
  // resolves — see the picker fallback below). blueprint_type still holds the
  // deleted product's engine_preset, so nulling the link leaves a coherent
  // system-preset selection behind.
  useEffect(() => {
    if (!customProductId) return;
    if (isProductsLoading || !productsData) return;
    if (pendingCustomId) return;
    const stillExists = customProducts.some((p) => p.id === customProductId);
    if (!stillExists) {
      form.setValue("custom_product_id", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customProductId, productsData, isProductsLoading, pendingCustomId]);

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
    // Auto-engage the carrier penalty-free cap. Picking a custom product is an
    // explicit statement that "this carrier limits withdrawals to X% during the
    // surrender period" — so the engine should respect that when planning
    // conversions, not silently exceed it. Without this, products like
    // Athene Base (5% cap) would display "5%" but plan 20%/yr conversions.
    form.setValue("respect_penalty_free_limit", true);
    // Default the cap scope to 'tax_only' if it hasn't been set yet. This
    // preserves the advisor's prior choice (e.g., if they had
    // 'all_distributions' selected, picking a different custom product
    // shouldn't silently reset that). Use getValues to avoid clobbering
    // a deliberate override.
    if (!form.getValues("penalty_free_scope")) {
      form.setValue("penalty_free_scope", "tax_only");
    }
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
    const cfg = product.config;
    const sa = cfg.state_availability;
    if (!sa) return;
    const clientState = (watchedState ?? "").toUpperCase();
    // Only manage a field if THIS product actually defines overrides for it.
    // Otherwise leave it alone — bonus is editable for custom products, and
    // clobbering on every state change would wipe a manual edit.
    const bonusOverrides = sa.bonus_overrides ?? {};
    if (Object.keys(bonusOverrides).length > 0) {
      // Apply the override for the new state if one exists, else RESTORE the
      // product's base bonus. Without the restore, switching from an override
      // state back to a plain state left the previous state's bonus stuck on
      // the form — a silently wrong projection. (Same for surrender below.)
      const stateBonus = bonusOverrides[clientState] as number | undefined;
      form.setValue("bonus_percent", stateBonus != null ? stateBonus : cfg.bonus.percentage);
    }
    const surrenderOverrides = sa.surrender_overrides ?? {};
    if (Object.keys(surrenderOverrides).length > 0) {
      const stateSurrender = surrenderOverrides[clientState] as number[] | undefined;
      const schedule = stateSurrender ?? cfg.surrender.schedule;
      form.setValue("surrender_schedule", schedule && schedule.length ? schedule : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedState, customProductId]);

  // Compute state-aware notice for UI.
  // Only `bonus_overrides` and `surrender_overrides` flow into the form fields
  // the engine reads. `vesting_overrides` and `mva_overrides` are stored on the
  // product for documentation purposes — the engine doesn't model vesting
  // recapture or MVA today, so we surface them as "noted, not modeled" rather
  // than claiming they were applied.
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
    const applied: string[] = [];
    if (hasBonus) applied.push(`bonus: ${sa.bonus_overrides![st]}%`);
    if (hasSurrender) applied.push("custom surrender schedule");
    const noted: string[] = [];
    if (hasVesting) noted.push("custom vesting schedule");
    if (hasMva) noted.push("MVA override");
    if (applied.length === 0 && noted.length === 0) return null;
    const parts: string[] = [];
    if (applied.length > 0) parts.push(`applied — ${applied.join(", ")}`);
    if (noted.length > 0) parts.push(`noted (not modeled) — ${noted.join(", ")}`);
    return {
      type: "info" as const,
      msg: `${st} overrides: ${parts.join("; ")}.`,
    };
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

  const isCarrierLocked = isFieldLocked("carrierName", formulaType, customProductId);
  const isProductLocked = isFieldLocked("productName", formulaType, customProductId);
  const isBonusLocked = isFieldLocked("bonus", formulaType, customProductId);
  const isGI = isGuaranteedIncomeProduct(formulaType);

  // Get product-specific GI data for conditional fields
  const giData = isGI ? GI_PRODUCT_DATA[formulaType as GuaranteedIncomeFormulaType] : null;

  // The locked "Annual Rider Fee" display must reflect the SELECTED custom
  // product's own fee (config.fees.annual_rider_fee), not the system preset
  // default — otherwise a 0-fee custom product (e.g. Allianz 222) still shows
  // the preset's 1.15% (David Abreu: "no fees on the rider, currently 1.15%").
  // The engine already uses the custom fee; this aligns the display with it.
  // `??` (not `||`) so an explicit 0 fee is preserved.
  const selectedCustomProduct = customProductId
    ? customProducts.find((p) => p.id === customProductId)
    : null;
  const displayRiderFee =
    selectedCustomProduct?.config?.fees?.annual_rider_fee ?? giData?.riderFee ?? 0;

  return (
    <FormSection title="3. New Account Data" description="Insurance product details">
      {/* Manage-products Dialog — opens centered over the builder so the advisor
          never loses their in-progress client. Reuses the Settings ProductsTab.
          Wide + capped height with internal scroll so the ProductsTab header
          (title + Community/Add buttons) lays out on one row. */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="border-b p-6 pb-4 pr-12">
            <DialogTitle>Manage your products</DialogTitle>
            <DialogDescription>
              Add, edit, or adopt products without leaving this client. New
              products appear in the picker as soon as you&apos;re done.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <ProductsTab embedded />
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Preset Dropdown */}
      <Controller
        name="blueprint_type"
        control={form.control}
        render={() => {
          const selectedProduct = ALL_PRODUCTS[formulaType];
          const selectedCustom = customProductId
            ? customProducts.find((p) => p.id === customProductId)
            : null;
          // Favorited products surface in their own group at the top for quick
          // access. To avoid rendering the same SelectItem value twice (Base UI
          // tracks selection by value — duplicates make selection ambiguous and
          // light up two checkmarks), exclude favorites from the Growth/Income
          // groups they'd otherwise also appear in.
          const favorites = customProducts.filter((p) => p.is_favorite);
          const customGrowth = customProducts.filter((p) => p.category === "growth" && !p.is_favorite);
          const customIncome = customProducts.filter((p) => p.category === "income" && !p.is_favorite);
          return (
            <Field>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor="blueprint_type" className="flex items-center gap-1.5">
                  Product Preset
                  <FieldHelp {...FIELD_HELP.blueprint_type} />
                </FieldLabel>
                <a
                  href="https://docs.google.com/document/d/1no9bs58mgqS97Bw_19pOoslGoALP0lz6/edit?usp=sharing&ouid=106247356235746651631&rtpof=true&sd=true"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  See our Preset List
                </a>
                <button
                  type="button"
                  onClick={() => setManageOpen(true)}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  + Manage your products
                </button>
              </div>
              <Select value={pickerValue} onValueChange={handlePickerChange} disabled={!!customProductId && isProductsLoading && !selectedCustom}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select product preset">
                    {selectedCustom ? (
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-primary" />
                        {selectedCustom.name}
                      </span>
                    ) : customProductId ? (
                      // Custom product id is set but the products list hasn't
                      // resolved yet (or the product was deleted). Fall back
                      // to whatever name we DO have on the form (loaded from
                      // the client row) instead of showing the system preset
                      // — otherwise the advisor sees the WRONG name, panics,
                      // re-picks a system preset, and silently nukes their
                      // custom_product_id link on save. Race triggers most
                      // often on a fresh duplicate or edit page load.
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-primary" />
                        {form.getValues("product_name") || form.getValues("carrier_name") || "Loading your product…"}
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
          <FieldHelp {...FIELD_HELP.carrier_name} />
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
          <FieldHelp {...FIELD_HELP.product_name} />
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
              <FieldHelp {...FIELD_HELP.bonus_percent} />
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
            value={`${displayRiderFee.toFixed(2)}%`}
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
            <FieldLabel htmlFor="rate_of_return" className="flex items-center gap-1.5">
              Rate of Return %
              <FieldHelp {...FIELD_HELP.rate_of_return} />
            </FieldLabel>
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
                  <FieldLabel htmlFor="roll_up_option" className="flex items-center gap-1.5">
                    Roll-Up Option
                    <FieldHelp {...FIELD_HELP.roll_up_option} />
                  </FieldLabel>
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
                  <FieldLabel htmlFor="payout_option" className="flex items-center gap-1.5">
                    Payout Option
                    <FieldHelp {...FIELD_HELP.payout_option} />
                  </FieldLabel>
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
                <FieldLabel className="flex items-center gap-1.5">
                  Payout Type
                  <FieldHelp {...FIELD_HELP.payout_type} />
                </FieldLabel>
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
            <FieldLabel htmlFor="income_start_age" className="flex items-center gap-1.5">
              Income Start Age
              <FieldHelp {...FIELD_HELP.income_start_age} />
            </FieldLabel>
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
            <FieldLabel htmlFor="gi_conversion_years" className="flex items-center gap-1.5">
              Years to Convert Before GI Purchase
              <FieldHelp {...FIELD_HELP.gi_conversion_years} />
            </FieldLabel>
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
                <FieldLabel className="flex items-center gap-1.5">
                  Conversion Tax Bracket
                  <FieldHelp {...FIELD_HELP.gi_conversion_bracket} />
                </FieldLabel>
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
