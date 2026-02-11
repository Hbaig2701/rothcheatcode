"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UserSettings } from "@/lib/types/settings";
import {
  defaultValuesSchema,
  type DefaultValuesFormData,
} from "@/lib/validations/settings";
import { useUpdateSettings } from "@/lib/queries/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/percent-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { US_STATES } from "@/lib/data/states";
import { Loader2, CheckCircle, RotateCcw, Lightbulb } from "lucide-react";

interface DefaultsTabProps {
  settings: UserSettings;
}

const SYSTEM_DEFAULTS: DefaultValuesFormData = {
  state: "CA",
  tax_rate: 24,
  max_tax_rate: 24,
  tax_payment_source: "from_taxable",
  heir_tax_rate: 40,
  rate_of_return: 7,
  baseline_comparison_rate: 7,
  end_age: 100,
  years_to_defer_conversion: 0,
  blueprint_type: "fia",
  conversion_type: "optimized_amount",
  protect_initial_premium: true,
  bonus_percent: 10,
  surrender_years: 7,
  penalty_free_percent: 10,
};

const CONVERSION_OPTIONS = [
  { value: "optimized_amount", label: "Optimized Amount" },
  { value: "fixed_amount", label: "Fixed Amount" },
  { value: "full_conversion", label: "Full Conversion" },
  { value: "no_conversion", label: "No Conversion" },
] as const;

const TAX_SOURCE_OPTIONS = [
  { value: "from_taxable", label: "External (from taxable accounts)" },
  { value: "from_ira", label: "Internal (from IRA)" },
] as const;

const BLUEPRINT_OPTIONS = [
  { value: "fia", label: "FIA (Generic)" },
  { value: "lincoln-optiblend-7", label: "Lincoln OptiBlend 7" },
  { value: "equitrust-marketedge-bonus", label: "EquiTrust MarketEdge Bonus" },
  { value: "american-equity-assetshield-bonus-10", label: "American Equity AssetShield BONUS 10" },
  { value: "athene-ascent-pro-10", label: "Athene Ascent Pro 10" },
  { value: "american-equity-incomeshield-bonus-10", label: "American Equity IncomeShield Bonus 10" },
  { value: "equitrust-marketearly-income-index", label: "EquiTrust MarketEarly Income Index" },
  { value: "north-american-income-pay-pro", label: "North American Income Pay Pro" },
] as const;

const PROTECT_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
] as const;

export function DefaultsTab({ settings }: DefaultsTabProps) {
  const updateSettings = useUpdateSettings();
  const [saved, setSaved] = useState(false);

  const defaults = (settings.default_values ?? {}) as Partial<DefaultValuesFormData>;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<DefaultValuesFormData>({
    resolver: zodResolver(defaultValuesSchema),
    defaultValues: {
      state: defaults.state ?? SYSTEM_DEFAULTS.state,
      tax_rate: defaults.tax_rate ?? SYSTEM_DEFAULTS.tax_rate,
      max_tax_rate: defaults.max_tax_rate ?? SYSTEM_DEFAULTS.max_tax_rate,
      tax_payment_source:
        defaults.tax_payment_source ?? SYSTEM_DEFAULTS.tax_payment_source,
      heir_tax_rate: defaults.heir_tax_rate ?? SYSTEM_DEFAULTS.heir_tax_rate,
      rate_of_return:
        defaults.rate_of_return ?? SYSTEM_DEFAULTS.rate_of_return,
      baseline_comparison_rate:
        defaults.baseline_comparison_rate ??
        SYSTEM_DEFAULTS.baseline_comparison_rate,
      end_age: defaults.end_age ?? SYSTEM_DEFAULTS.end_age,
      years_to_defer_conversion:
        defaults.years_to_defer_conversion ??
        SYSTEM_DEFAULTS.years_to_defer_conversion,
      blueprint_type:
        defaults.blueprint_type ?? SYSTEM_DEFAULTS.blueprint_type,
      conversion_type:
        defaults.conversion_type ?? SYSTEM_DEFAULTS.conversion_type,
      protect_initial_premium:
        defaults.protect_initial_premium ??
        SYSTEM_DEFAULTS.protect_initial_premium,
      bonus_percent: defaults.bonus_percent ?? SYSTEM_DEFAULTS.bonus_percent,
      surrender_years:
        defaults.surrender_years ?? SYSTEM_DEFAULTS.surrender_years,
      penalty_free_percent:
        defaults.penalty_free_percent ?? SYSTEM_DEFAULTS.penalty_free_percent,
    },
  });

  const onSubmit = async (data: DefaultValuesFormData) => {
    await updateSettings.mutateAsync({ default_values: data });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    reset(SYSTEM_DEFAULTS);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Values</CardTitle>
        <CardDescription>
          Pre-fill common inputs when creating new Formulas. You can always
          override them for individual clients.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-8">
          {/* Tax Defaults */}
          <section>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Tax Defaults
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                name="state"
                control={control}
                render={({ field, fieldState }) => {
                  const selectedState = US_STATES.find(
                    (s) => s.code === field.value
                  );
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Default State</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select state">
                            {selectedState
                              ? `${selectedState.code} - ${selectedState.name}`
                              : "Select state"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.code} - {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  );
                }}
              />

              <Controller
                name="max_tax_rate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Default Max Tax Rate</FieldLabel>
                    <PercentInput
                      value={field.value ?? 24}
                      onChange={field.onChange}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                name="tax_payment_source"
                control={control}
                render={({ field, fieldState }) => {
                  const selectedOpt = TAX_SOURCE_OPTIONS.find(
                    (o) => o.value === field.value
                  );
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Tax Payment Source</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select source">
                            {selectedOpt?.label ?? "Select source"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {TAX_SOURCE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  );
                }}
              />

              <Controller
                name="heir_tax_rate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Heir Tax Rate</FieldLabel>
                    <PercentInput
                      value={field.value ?? 40}
                      onChange={field.onChange}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
          </section>

          {/* Account Defaults */}
          <section>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Account Defaults
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                name="rate_of_return"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Default Rate of Return</FieldLabel>
                    <PercentInput
                      value={field.value ?? 7}
                      onChange={field.onChange}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                name="baseline_comparison_rate"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Baseline Comparison Rate</FieldLabel>
                    <PercentInput
                      value={field.value ?? 7}
                      onChange={field.onChange}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Field>
                <FieldLabel>Default End Age</FieldLabel>
                <Input
                  type="number"
                  {...register("end_age", { valueAsNumber: true })}
                  min={55}
                  max={120}
                />
                <FieldError
                  errors={errors.end_age ? [errors.end_age] : undefined}
                />
              </Field>

              <Field>
                <FieldLabel>Years to Defer Conversion</FieldLabel>
                <Input
                  type="number"
                  {...register("years_to_defer_conversion", {
                    valueAsNumber: true,
                  })}
                  min={0}
                  max={30}
                />
                <FieldError
                  errors={
                    errors.years_to_defer_conversion
                      ? [errors.years_to_defer_conversion]
                      : undefined
                  }
                />
              </Field>
            </div>
          </section>

          {/* Product Defaults */}
          <section>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Product Defaults
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                name="blueprint_type"
                control={control}
                render={({ field, fieldState }) => {
                  const selectedOpt = BLUEPRINT_OPTIONS.find(
                    (o) => o.value === field.value
                  );
                  return (
                    <Field
                      data-invalid={fieldState.invalid}
                      className="sm:col-span-2"
                    >
                      <FieldLabel>Default Formula Type</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type">
                            {selectedOpt?.label ?? "Select type"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {BLUEPRINT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  );
                }}
              />

              <Controller
                name="conversion_type"
                control={control}
                render={({ field, fieldState }) => {
                  const selectedOpt = CONVERSION_OPTIONS.find(
                    (o) => o.value === field.value
                  );
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel>Default Conversion Type</FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type">
                            {selectedOpt?.label ?? "Select type"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CONVERSION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  );
                }}
              />

              <Controller
                name="protect_initial_premium"
                control={control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Protect Initial Premium</FieldLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(v === "true")}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {field.value ? "Yes" : "No"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PROTECT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>
          </section>

          {/* Tip */}
          <div className="flex items-start gap-3 rounded-lg border border-muted-foreground/20 bg-muted/30 p-4">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-yellow-500" />
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> Set these to your most common client scenario
              to save time. You can always adjust values for individual clients.
            </p>
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-500">
              <CheckCircle className="size-4" /> Saved
            </span>
          )}
          <Button type="button" variant="outline" onClick={handleReset}>
            <RotateCcw className="size-4" />
            Reset to System Defaults
          </Button>
          <Button type="submit" disabled={updateSettings.isPending}>
            {updateSettings.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Save Changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
