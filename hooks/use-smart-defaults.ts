"use client";

import { useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";

/**
 * Calculate life expectancy based on DOB using simplified actuarial estimate.
 * Returns age at expected death (current age + remaining years).
 * Uses SSA period life table approximation.
 */
function calculateLifeExpectancy(dob: string): number | null {
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    const currentAge = today.getFullYear() - birthDate.getFullYear();

    if (currentAge < 0 || currentAge > 120) return null;

    // Simplified actuarial approximation based on SSA tables
    // Average remaining years decreases with age
    let remainingYears: number;
    if (currentAge < 65) {
      remainingYears = 85 - currentAge; // Rough estimate: expect to live to 85
    } else if (currentAge < 75) {
      remainingYears = 90 - currentAge; // Older folks: expect to live to 90
    } else {
      remainingYears = Math.max(5, 95 - currentAge); // Very old: at least 5 more years
    }

    return currentAge + remainingYears;
  } catch {
    return null;
  }
}

/**
 * Calculate current age from DOB
 */
function calculateCurrentAge(dob: string): number | null {
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 && age <= 120 ? age : null;
  } catch {
    return null;
  }
}

export function useSmartDefaults(form: UseFormReturn<ClientFormData>) {
  const dob = form.watch("date_of_birth");
  const { dirtyFields } = form.formState;

  // Calculate default life expectancy from DOB
  // Updates whenever DOB changes, unless user has manually modified life_expectancy
  useEffect(() => {
    if (dob && dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Only skip if user has explicitly edited the life_expectancy field
      if (!dirtyFields.life_expectancy) {
        const lifeExp = calculateLifeExpectancy(dob);
        if (lifeExp) {
          form.setValue("life_expectancy", lifeExp, { shouldDirty: false });
        }
      }
    }
  }, [dob, form, dirtyFields.life_expectancy]);

  // Calculate default start age from current age
  // Updates whenever DOB changes, unless user has manually modified start_age
  useEffect(() => {
    if (dob && dob.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Only skip if user has explicitly edited the start_age field
      if (!dirtyFields.start_age) {
        const age = calculateCurrentAge(dob);
        if (age !== null) {
          // Start conversion at current age or minimum 50
          form.setValue("start_age", Math.max(age, 50), { shouldDirty: false });
        }
      }
    }
  }, [dob, form, dirtyFields.start_age]);
}
