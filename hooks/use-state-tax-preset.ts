"use client";

import { useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ClientFormData } from "@/lib/validations/client";
import { getDefaultStateTaxRate } from "@/lib/data/states";

function isCustomRate(state: unknown, rate: unknown): boolean {
  return (
    typeof state === "string" &&
    state.length === 2 &&
    typeof rate === "number" &&
    Math.abs(rate - getDefaultStateTaxRate(state)) > 0.01
  );
}

/**
 * Keeps the State Tax field in step with the State dropdown without ever
 * overwriting a rate the advisor set by hand.
 *
 * The state preset is written ONLY when the user actually changes the State
 * dropdown (react-hook-form reports those as type "change"), or when the rate
 * is empty. Opening a client, switching scenarios and programmatic setValue
 * calls leave a saved rate alone.
 *
 * This replaces two mount-time effects that raced: the first flagged a custom
 * rate via setState, which only lands on the next render; the second ran in the
 * same commit with the stale `false` and wrote the preset over the stored rate.
 * So every open-and-save silently reset a custom rate — NY 13.56% → 10.9%
 * (Airinhos Serradas, 2026-09), PA 0% → 3.07% (Jain case). Same class of bug
 * as the penalty-free clobber fixed in input-sidebar.tsx (Jorge Tola).
 */
export function useStateTaxPreset(form: UseFormReturn<ClientFormData>) {
  const [isManualEdit, setIsManualEdit] = useState(() =>
    isCustomRate(form.getValues("state"), form.getValues("state_tax_rate")),
  );
  // Read inside the watch subscription, which outlives any single render.
  const manualRef = useRef(isManualEdit);
  useEffect(() => {
    manualRef.current = isManualEdit;
  }, [isManualEdit]);

  // A client that has a state but no rate yet still gets the preset filled in,
  // as before — there's nothing to clobber when the rate is empty.
  useEffect(() => {
    const state = form.getValues("state");
    const rate = form.getValues("state_tax_rate");
    if (typeof state === "string" && state.length === 2 && (rate === null || rate === undefined)) {
      form.setValue("state_tax_rate", getDefaultStateTaxRate(state));
    }
  }, [form]);

  useEffect(() => {
    const sub = form.watch((values, { name, type }) => {
      if (name === "state" && type === "change") {
        // The advisor picked a different state. Follow it unless they've
        // taken manual control of the rate.
        const state = values.state;
        if (!manualRef.current && typeof state === "string" && state.length === 2) {
          form.setValue("state_tax_rate", getDefaultStateTaxRate(state));
        }
      } else if (name === undefined) {
        // form.reset() — a different client or scenario was loaded. Re-derive
        // manual mode from what was loaded rather than carrying it over.
        const manual = isCustomRate(values.state, values.state_tax_rate);
        manualRef.current = manual;
        setIsManualEdit(manual);
      }
    });
    return () => sub.unsubscribe();
  }, [form]);

  const handleManualEdit = () => {
    manualRef.current = true;
    setIsManualEdit(true);
  };

  const handleUsePreset = () => {
    manualRef.current = false;
    setIsManualEdit(false);
    const state = form.getValues("state");
    if (typeof state === "string" && state.length === 2) {
      form.setValue("state_tax_rate", getDefaultStateTaxRate(state));
    }
  };

  return { isManualEdit, handleManualEdit, handleUsePreset };
}
