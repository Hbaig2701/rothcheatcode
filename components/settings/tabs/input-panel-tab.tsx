"use client";

import { useState } from "react";
import type { UserSettings } from "@/lib/types/settings";
import { useUpdateSettings } from "@/lib/queries/settings";
import {
  INPUT_FEATURES,
  INPUT_FEATURE_KEYS,
  type InputFeatureKey,
} from "@/lib/input-features";

/**
 * Settings → Input Panel. Turns optional features of the client input form
 * on or off for this advisor. Each toggle saves immediately.
 */
export function InputPanelTab({ settings }: { settings: UserSettings }) {
  const updateSettings = useUpdateSettings();
  // Optimistic copy so toggles respond instantly; cleared once the refetch lands.
  const [optimistic, setOptimistic] = useState<InputFeatureKey[] | null>(null);
  const hidden = optimistic ?? settings.hidden_input_features ?? [];
  const [error, setError] = useState<string | null>(null);

  const save = (next: InputFeatureKey[]) => {
    setOptimistic(next);
    setError(null);
    updateSettings.mutate(
      { hidden_input_features: next },
      {
        onSettled: () => setOptimistic(null),
        onError: () => setError("Couldn't save that change. Please try again."),
      },
    );
  };

  const toggle = (key: InputFeatureKey) => {
    save(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  };

  // Group by where each feature sits in the form, in form order.
  const groups = INPUT_FEATURES.reduce<{ location: string; features: typeof INPUT_FEATURES[number][] }[]>(
    (acc, f) => {
      const group = acc.find((g) => g.location === f.location);
      if (group) group.features.push(f);
      else acc.push({ location: f.location, features: [f] });
      return acc;
    },
    [],
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium text-foreground">Input Panel</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which optional features appear when you enter a client&apos;s details. Turn off what
          you don&apos;t use to keep the form short. Turning a feature off never changes a client&apos;s
          results: if a client already uses it, it still shows on that client.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save([])}
          disabled={updateSettings.isPending || hidden.length === 0}
          className="h-8 rounded-md border border-border px-3 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
        >
          Turn all on
        </button>
        <button
          type="button"
          onClick={() => save([...INPUT_FEATURE_KEYS])}
          disabled={updateSettings.isPending || hidden.length === INPUT_FEATURE_KEYS.length}
          className="h-8 rounded-md border border-border px-3 text-xs text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
        >
          Turn all off
        </button>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}

      {groups.map((group) => (
        <div key={group.location}>
          <p className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-3">
            {group.location}
          </p>
          <div className="space-y-2">
            {group.features.map((f) => {
              const on = !hidden.includes(f.key);
              const id = `input-feature-${f.key}`;
              return (
                <label
                  key={f.key}
                  htmlFor={id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.description}</p>
                  </div>
                  <button
                    id={id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggle(f.key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      on ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
                        on ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
