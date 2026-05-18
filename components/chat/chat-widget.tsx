"use client";

import { useEffect, useState } from "react";
import { ChatLauncher } from "./chat-launcher";
import { ChatDrawer } from "./chat-drawer";

const STORAGE_KEY = "retex_chat_widget_state";

type WidgetState = "closed" | "open";

/**
 * Top-level chat widget mounted at the dashboard layout. Owns the
 * open/closed state, persists it across page navigations, and renders both
 * the floating launcher and the drawer. The active conversation lives
 * inside the drawer so opening/closing the widget doesn't lose context.
 */
export function ChatWidget() {
  const [state, setState] = useState<WidgetState>("closed");

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
