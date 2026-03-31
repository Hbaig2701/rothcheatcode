"use client";

import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon } from "lucide-react";

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

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
    </div>
  );
}
