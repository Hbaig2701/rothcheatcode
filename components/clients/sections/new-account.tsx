"use client";

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
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function NewAccountSection() {
  const form = useFormContext<ClientFormData>();
  const formulaType = form.watch("blueprint_type") as FormulaType;

  // Handle formula type change - apply product defaults
  const handleFormulaTypeChange = (value: FormulaType | null) => {
    if (!value) return;
    const product = ALL_PRODUCTS[value];
    if (!product) return;

    // Update form with new formula type and product defaults
    form.setValue("blueprint_type", value);
    form.setValue("carrier_name", product.defaults.carrierName);
    form.setValue("product_name", product.defaults.productName);
    form.setValue("bonus_percent", product.defaults.bonus);
    form.setValue("surrender_years", product.defaults.surrenderYears);
    form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
    form.setValue("rate_of_return", product.defaults.rateOfReturn);

    // Set GI-specific defaults when switching to a GI product
    const giData = GI_PRODUCT_DATA[value as GuaranteedIncomeFormulaType];
    if (giData) {
      // Set roll-up option default for American Equity
      if (giData.hasRollUpOptions && giData.rollUp.defaultOption) {
        form.setValue("roll_up_option", giData.rollUp.defaultOption as "simple" | "compound");
      } else {
        form.setValue("roll_up_option", null);
      }

      // Set payout option default for North American
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
  };

  const isCarrierLocked = isFieldLocked("carrierName", formulaType);
  const isProductLocked = isFieldLocked("productName", formulaType);
  const isBonusLocked = isFieldLocked("bonus", formulaType);
  const isGI = isGuaranteedIncomeProduct(formulaType);

  // Get product-specific GI data for conditional fields
  const giData = isGI ? GI_PRODUCT_DATA[formulaType as GuaranteedIncomeFormulaType] : null;

  return (
    <FormSection title="3. New Account Data" description="Insurance product details">
      {/* Formula Type Dropdown */}
      <Controller
        name="blueprint_type"
        control={form.control}
        render={({ field }) => {
          const selectedProduct = ALL_PRODUCTS[field.value as FormulaType];
          return (
            <Field>
              <FieldLabel htmlFor="blueprint_type">Formula Type</FieldLabel>
              <Select value={field.value} onValueChange={handleFormulaTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Formula type">
                    {selectedProduct?.label ?? "Select Formula type"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Growth</SelectLabel>
                    {Object.values(GROWTH_PRODUCTS).map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Guaranteed Income</SelectLabel>
                    {Object.values(GUARANTEED_INCOME_PRODUCTS).map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.label}
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
                {ALL_PRODUCTS[formulaType]?.description || "Select a product template"}
              </FieldDescription>
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
          {/* Roll-Up Option - American Equity only */}
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

          {/* Payout Option - North American only */}
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
        </>
      )}
    </FormSection>
  );
}
