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
import { GROWTH_PRODUCTS, isFieldLocked, type BlueprintType } from "@/lib/config/products";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function NewAccountSection() {
  const form = useFormContext<ClientFormData>();
  const blueprintType = form.watch("blueprint_type") as BlueprintType;

  // Handle blueprint type change - apply product defaults
  const handleBlueprintTypeChange = (value: BlueprintType | null) => {
    if (!value) return;
    const product = GROWTH_PRODUCTS[value];
    if (!product) return;

    // Update form with new blueprint type and product defaults
    form.setValue("blueprint_type", value);
    form.setValue("carrier_name", product.defaults.carrierName);
    form.setValue("product_name", product.defaults.productName);
    form.setValue("bonus_percent", product.defaults.bonus);
    form.setValue("surrender_years", product.defaults.surrenderYears);
    form.setValue("penalty_free_percent", product.defaults.penaltyFreePercent);
    form.setValue("rate_of_return", product.defaults.rateOfReturn);
  };

  const isCarrierLocked = isFieldLocked("carrierName", blueprintType);
  const isProductLocked = isFieldLocked("productName", blueprintType);
  const isBonusLocked = isFieldLocked("bonus", blueprintType);

  return (
    <FormSection title="3. New Account Data" description="Insurance product details">
      {/* Blueprint Type Dropdown */}
      <Controller
        name="blueprint_type"
        control={form.control}
        render={({ field }) => {
          const selectedProduct = GROWTH_PRODUCTS[field.value as BlueprintType];
          return (
            <Field>
              <FieldLabel htmlFor="blueprint_type">Blueprint Type</FieldLabel>
              <Select value={field.value} onValueChange={handleBlueprintTypeChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select blueprint type">
                    {selectedProduct?.label ?? "Select blueprint type"}
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
                  {/* Future phases - shown as disabled */}
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground/60">
                      Guaranteed Income (Coming Soon)
                    </SelectLabel>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground/60">
                      AUM (Coming Soon)
                    </SelectLabel>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {GROWTH_PRODUCTS[blueprintType]?.description || "Select a product template"}
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
    </FormSection>
  );
}
