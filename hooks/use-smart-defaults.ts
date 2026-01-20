"use client";

import { useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";

/**
 * Calculate life expectancy based on current age using simplified actuarial estimate.
 * Uses SSA period life table approximation.
 */
function calculateLifeExpectancy(currentAge: number): number | null {
  if (currentAge < 0 || currentAge > 120) return null;

  // Simplified actuarial approximation based on SSA tables
  let targetAge: number;
  if (currentAge < 65) {
    targetAge = 85;
  } else if (currentAge < 75) {
    targetAge = 90;
  } else {
    targetAge = Math.max(currentAge + 5, 95);
  }

  return targetAge;
}

export function useSmartDefaults(form: UseFormReturn<ClientFormData>) {
  const age = form.watch("age");

  // Calculate end_age based on life expectancy when age changes
  useEffect(() => {
    if (age && age > 0 && age <= 100) {
      const endAge = form.getValues("end_age");
      // Only set if end_age is at default (100) or not yet set
      if (!endAge || endAge === 100) {
        const lifeExp = calculateLifeExpectancy(age);
        if (lifeExp && lifeExp > age) {
          // Keep end_age at 100 (default from Blueprint) or life expectancy, whichever is higher
          form.setValue("end_age", Math.max(lifeExp, 100), { shouldDirty: false });
        }
      }
    }
  }, [age, form]);
}
