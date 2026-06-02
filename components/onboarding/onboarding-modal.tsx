"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, Clock, X } from "lucide-react";

/**
 * Takeover modal that fires once on a new advisor's first dashboard
 * load and points them at /training/onboarding. Suppressed forever
 * once they either click into the video (completes via the Loom
 * event listener on the training page) or dismiss the modal.
 *
 * Mounted in the dashboard layout so it covers every page — a brand
 * new user landing on /clients sees it just as well as one landing
 * on /dashboard.
 */
interface OnboardingStatus {
  dismissed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  should_show_modal: boolean;
}

export function OnboardingModal() {
  const qc = useQueryClient();
  // Local override: once the user clicks "Watch onboarding" or "Skip",
  // we want the modal gone immediately, without waiting for the API
  // response to settle. The server call still fires in the background
  // via the mutation, but the UI shouldn't lag.
  const [hidden, setHidden] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: async (): Promise<OnboardingStatus> => {
      const res = await fetch("/api/onboarding");
      if (!res.ok) throw new Error("Failed to load onboarding status");
      return res.json();
    },
    // Cache aggressively — the status only changes when the user
    // explicitly acts. No need to refetch on focus / interval.
    staleTime: 5 * 60_000,
    // Don't fire on retry storms if the API errors out (e.g. migration
    // not yet applied). Silently disable the modal instead.
    retry: false,
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "dismissed" }),
      });
      if (!res.ok) throw new Error("dismiss failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding"] }),
  });

  // Lock body scroll while the modal is up so the page underneath
  // doesn't slide around behind the takeover.
  useEffect(() => {
    if (!data?.should_show_modal || hidden) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [data?.should_show_modal, hidden]);

  if (isLoading || !data || !data.should_show_modal || hidden) {
    return null;
  }

  function handleSkip() {
    setHidden(true);
    dismissMutation.mutate();
  }

  // Clicking "Watch now" doesn't immediately mark dismissed — the
  // training page will record "started" once the iframe emits its
  // first event, and "completed" at end-of-video. We just hide the
  // modal so the click-through to /training/onboarding is clean.
  function handleWatch() {
    setHidden(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="relative max-w-xl w-full rounded-[16px] bg-bg-card border border-gold-border shadow-2xl p-8 animate-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={handleSkip}
          aria-label="Close"
          className="absolute top-4 right-4 text-text-dim hover:text-foreground transition-colors p-1 rounded-full hover:bg-bg-card-hover"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex h-16 w-16 items-center justify-center rounded-[14px] bg-gold/20 border border-gold-border mb-5 mx-auto">
          <PlayCircle className="h-9 w-9 text-gold" />
        </div>

        <h2
          id="onboarding-modal-title"
          className="text-2xl font-display font-bold text-foreground text-center mb-3"
        >
          Welcome to Retirement Expert
        </h2>

        <p className="text-sm text-text-dim text-center mb-6 leading-relaxed max-w-md mx-auto">
          Before you start adding clients, watch this 30-minute walkthrough.
          It covers everything you need to use the platform end-to-end —
          adding clients, running conversion strategies, generating reports,
          and reading the results.
        </p>

        <div className="flex items-center justify-center gap-3 mb-7 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/15 text-gold font-semibold tracking-wider uppercase">
            Must watch
          </span>
          <span className="inline-flex items-center gap-1.5 text-text-dim">
            <Clock className="h-3.5 w-3.5" />
            30 minutes
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/training/onboarding"
            onClick={handleWatch}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[10px] bg-gold text-primary-foreground font-semibold hover:bg-gold/90 transition-colors"
          >
            <PlayCircle className="h-5 w-5" />
            Watch onboarding video
          </Link>
          <button
            type="button"
            onClick={handleSkip}
            disabled={dismissMutation.isPending}
            className="inline-flex items-center justify-center px-6 py-3 rounded-[10px] text-text-dim hover:text-foreground hover:bg-bg-card-hover transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>

        <p className="text-[11px] text-text-dim text-center mt-5">
          You can always find it later under Training Centre.
        </p>
      </div>
    </div>
  );
}
