"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon } from "lucide-react";

interface SettingsResponse {
  chat_widget_enabled?: boolean;
}

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<SettingsResponse> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  // Treat missing/undefined as enabled — keeps existing accounts opted in
  // by default, matches the column default in the migration.
  const chatEnabled = settings?.chat_widget_enabled !== false;
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const effectiveEnabled = optimisticEnabled ?? chatEnabled;

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_widget_enabled: next }),
      });
      if (!res.ok) throw new Error("Failed to update preference");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
    onError: () => setOptimisticEnabled(null),
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium text-foreground">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how the app looks to you.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground mb-4">Theme</p>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          {/* Light option */}
          <button
            onClick={() => setTheme("light")}
            className={`group relative rounded-xl border-2 p-4 transition-all cursor-pointer ${
              theme === "light"
                ? "border-primary bg-accent"
                : "border-border hover:border-primary/40 bg-transparent"
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg bg-[#f8f7f4] border border-[#e2dfd8] p-3 shadow-sm">
                <Sun className="size-6 text-[#b8941e]" />
              </div>
              <div className="space-y-0.5 text-center">
                <p className="text-sm font-medium text-foreground">Light</p>
                <p className="text-xs text-muted-foreground">Bright and clean</p>
              </div>
            </div>
            {theme === "light" && (
              <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
                <svg className="size-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>

          {/* Dark option */}
          <button
            onClick={() => setTheme("dark")}
            className={`group relative rounded-xl border-2 p-4 transition-all cursor-pointer ${
              theme === "dark"
                ? "border-primary bg-accent"
                : "border-border hover:border-primary/40 bg-transparent"
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] p-3 shadow-sm">
                <Moon className="size-6 text-[#d4af37]" />
              </div>
              <div className="space-y-0.5 text-center">
                <p className="text-sm font-medium text-foreground">Dark</p>
                <p className="text-xs text-muted-foreground">Easy on the eyes</p>
              </div>
            </div>
            {theme === "dark" && (
              <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
                <svg className="size-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-8">
        <p className="text-sm font-medium text-foreground mb-1">AI assistant</p>
        <p className="text-xs text-muted-foreground mb-4 max-w-md">
          The floating gold button in the bottom-right that opens the in-app assistant.
          Turn it off to hide the button entirely.
        </p>
        <label
          htmlFor="chat-widget-toggle"
          className="flex items-center justify-between max-w-md rounded-lg border border-border p-4 cursor-pointer hover:border-primary/40 transition-colors"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Show assistant launcher</p>
            <p className="text-xs text-muted-foreground">
              {effectiveEnabled
                ? "Launcher appears on every page."
                : "Launcher is hidden."}
            </p>
          </div>
          <button
            id="chat-widget-toggle"
            type="button"
            role="switch"
            aria-checked={effectiveEnabled}
            disabled={toggleMutation.isPending}
            onClick={() => {
              const next = !effectiveEnabled;
              setOptimisticEnabled(next);
              toggleMutation.mutate(next);
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
              effectiveEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block size-5 transform rounded-full bg-white transition-transform ${
                effectiveEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </div>
    </div>
  );
}
