"use client";

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { EyeOff } from "lucide-react";
import { useUserSettings } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";
import { INPUT_FEATURES_BY_KEY, type InputFeatureKey } from "@/lib/input-features";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";

/**
 * Whether an optional input feature renders on this client.
 *
 * `show` is false only when the advisor hid the feature in Settings AND this
 * client doesn't use it. `forced` marks the exception: hidden in Settings but
 * shown because the client's saved values drive the projection. Once forced,
 * it stays shown for the life of the form, so clearing a field to retype it
 * doesn't make the block vanish mid-edit.
 *
 * Reads settings itself rather than taking a prop because the same sections
 * render in the client form AND the results-page Inputs drawer.
 */
export function useInputFeature(key: InputFeatureKey): { show: boolean; forced: boolean } {
  const def = INPUT_FEATURES_BY_KEY[key];
  const { data: settings } = useUserSettings();
  const { control } = useFormContext();
  const watched = useWatch({ control, name: def.fields as string[] }) as unknown[];
  const values = Object.fromEntries(def.fields.map((f, i) => [f, watched[i]]));
  const inUse = def.inUse(values);

  // Missing column (migration not yet applied) or settings still loading:
  // show everything rather than hide something the advisor relies on.
  const hiddenInSettings = settings?.hidden_input_features?.includes(key) ?? false;

  // Adjust-state-during-render (React's documented pattern), not an effect.
  const [latched, setLatched] = useState(false);
  if (hiddenInSettings && inUse && !latched) setLatched(true);

  const forced = hiddenInSettings && (inUse || latched);
  return { show: !hiddenInSettings || forced, forced };
}

/**
 * Display numbers for the sections after 6. Conversion, so hiding Section 7
 * and/or 8 doesn't leave the form jumping from 6 to 9. Mirrors the
 * visibility rules in AumAllocationSection (advisory fee never shows for GI).
 */
export function useLateSectionNumbers(): { withdrawals: number; advanced: number } {
  const { control } = useFormContext();
  const formulaType = useWatch({ control, name: "blueprint_type" }) as FormulaType;
  const advisory = useInputFeature("advisory_fee");
  const aum = useInputFeature("aum_allocation");
  const withdrawals = useInputFeature("withdrawals");
  const section7 = (!isGuaranteedIncomeProduct(formulaType) && advisory.show) || aum.show;
  const withdrawalsNumber = section7 ? 8 : 7;
  return {
    withdrawals: withdrawalsNumber,
    advanced: withdrawals.show ? withdrawalsNumber + 1 : withdrawalsNumber,
  };
}

/** Shown beside a feature that is hidden in Settings but used by this client. */
export function HiddenFeatureNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <EyeOff className="size-3.5 shrink-0" />
      Hidden in Settings → Input Panel. Shown here because this client uses it.
    </p>
  );
}
