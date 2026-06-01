"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatLauncher } from "./chat-launcher";
import { ChatDrawer } from "./chat-drawer";

const STORAGE_KEY = "retex_chat_widget_state";

type WidgetState = "closed" | "open";

interface WidgetPreference {
  chat_widget_enabled?: boolean;
}

/**
 * Top-level chat widget mounted at the dashboard layout. Owns the
 * open/closed state, persists it across page navigations, and renders both
 * the floating launcher and the drawer. The active conversation lives
 * inside the drawer so opening/closing the widget doesn't lose context.
 *
 * Advisor opt-out: `user_settings.chat_widget_enabled` (Settings →
 * Appearance) gates whether the launcher renders at all. The chat API
 * routes themselves stay reachable for admin tooling and support flows.
 */
export function ChatWidget() {
  const [state, setState] = useState<WidgetState>("closed");

  // Share the same query key as the Appearance tab so flipping the toggle
  // in one place updates the widget in real time without a refresh. Treat
  // any error (e.g. user_settings not yet seeded) as "show the widget" —
  // failing closed would silently hide it for new accounts.
  const { data: pref } = useQuery({
    queryKey: ["settings"],
    queryFn: async (): Promise<WidgetPreference> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
  const widgetEnabled = pref?.chat_widget_enabled !== false;

  // Restore last state on mount so navigating between pages doesn't close
  // the widget unexpectedly. Defer to useEffect for SSR safety.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "open" || stored === "closed") setState(stored);
    } catch {
      // localStorage unavailable — fall back to closed.
    }
  }, []);

  function setStateAndPersist(next: WidgetState) {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be disabled; not fatal.
    }
  }

  // Advisor turned the widget off in Settings → Appearance. Render nothing
  // — no launcher, no drawer mounted. Flipping the preference back on
  // re-mounts both via the React Query refetch.
  if (!widgetEnabled) return null;

  return (
    <>
      <ChatLauncher
        hidden={state === "open"}
        onClick={() => setStateAndPersist("open")}
      />
      <ChatDrawer
        open={state === "open"}
        onMinimize={() => setStateAndPersist("closed")}
        onClose={() => setStateAndPersist("closed")}
      />
    </>
  );
}
