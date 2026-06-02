"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/**
 * Embeds a Loom video and tracks watch progress against the
 * /api/onboarding endpoint. Fires two events to the server:
 *
 *   - "started"    on the FIRST postMessage from the iframe
 *                  (any interaction is sufficient — we just want to
 *                  know they engaged)
 *   - "completed"  when we detect end-of-video, either from a Loom
 *                  postMessage that looks like an end/complete event,
 *                  or when reported watch percentage hits 100, or via
 *                  the manual "Mark as watched" fallback below.
 *
 * Loom's basic embed postMessage format isn't fully documented, so
 * the listener is intentionally defensive — it accepts several plausible
 * shapes and matches on event keywords. A manual fallback button is
 * always available beneath the video so advisors aren't blocked if
 * the auto-detection misses.
 */
interface LoomPlayerProps {
  src: string;
  title?: string;
}

const LOOM_ORIGIN = "https://www.loom.com";

interface LoomMessageData {
  event?: string;
  type?: string;
  percent?: number;
  percentWatched?: number;
  currentTime?: number;
  duration?: number;
}

function looksLikeCompletion(data: LoomMessageData): boolean {
  // Match anything that smells like end-of-video. Loom's embed emits
  // different shapes across versions; rather than depend on one we
  // catch a small whitelist of keywords plus a percent threshold.
  const event = (data.event ?? data.type ?? "").toLowerCase();
  if (/(end|complete|finish|done)/.test(event)) return true;
  const percent = data.percent ?? data.percentWatched;
  if (typeof percent === "number" && percent >= 99) return true;
  if (
    typeof data.currentTime === "number" &&
    typeof data.duration === "number" &&
    data.duration > 0 &&
    data.currentTime / data.duration >= 0.99
  ) {
    return true;
  }
  return false;
}

export function LoomPlayer({ src, title }: LoomPlayerProps) {
  const [completed, setCompleted] = useState(false);
  const [marking, setMarking] = useState(false);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  // Initial status read — if the user has already completed the
  // video before, surface the "watched" checkmark immediately and
  // skip the listener wiring (no need to re-fire events on rewatch).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.completed_at) {
          completedRef.current = true;
          setCompleted(true);
        }
        if (data?.started_at) {
          startedRef.current = true;
        }
      } catch {
        // Non-fatal — proceed without prior status.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reportEvent(event: "started" | "completed") {
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
    } catch {
      // Best-effort tracking — never block the UI on a failure.
    }
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Loom's iframe posts from its own origin. Ignore everything else.
      if (e.origin !== LOOM_ORIGIN) return;

      // Treat any first message from the Loom iframe as "engaged" — the
      // user clicked something or video started. We need at least one
      // signal to mark "started" since Loom's basic embed doesn't
      // reliably emit a dedicated "play" event we can rely on.
      if (!startedRef.current) {
        startedRef.current = true;
        reportEvent("started");
      }

      let data: LoomMessageData;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;

      if (!completedRef.current && looksLikeCompletion(data)) {
        completedRef.current = true;
        setCompleted(true);
        reportEvent("completed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function handleManualMarkWatched() {
    if (completedRef.current) return;
    setMarking(true);
    completedRef.current = true;
    setCompleted(true);
    await reportEvent("completed");
    setMarking(false);
  }

  return (
    <div>
      <div className="rounded-[14px] overflow-hidden border border-border-default bg-bg-card shadow-lg">
        <div style={{ position: "relative", paddingBottom: "56.470588235294116%", height: 0 }}>
          <iframe
            src={src}
            // Modern Loom embeds need explicit feature-policy grants to
            // initialise the player when embedded cross-origin. Without
            // these the iframe loads but Loom's React app falls into its
            // generic "Sorry, something went wrong" state. Granting the
            // standard video-embed feature set (autoplay, fullscreen,
            // encrypted-media, picture-in-picture, web-share, plus
            // accelerometer/gyroscope which Loom probes during init)
            // restores playback for users whose browsers enforce these
            // permissions strictly.
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            // referrerpolicy matters for some workspace-level embed checks.
            // strict-origin sends the origin without the path, which is
            // what most third-party embed permissions key off of.
            referrerPolicy="strict-origin"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: 0,
            }}
            title={title ?? "Onboarding video"}
          />
        </div>
      </div>

      <div className="mt-3 text-xs text-text-dim">
        Trouble loading the video?{" "}
        <a
          href={src.replace("/embed/", "/share/").split("?")[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold underline hover:no-underline"
        >
          Open it directly on Loom
        </a>{" "}
        in a new tab.
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-text-dim">
          We&apos;ll mark this as watched automatically when the video finishes.
          If it doesn&apos;t register, use the button on the right.
        </p>
        {completed ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-gold font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Marked as watched
          </span>
        ) : (
          <button
            type="button"
            onClick={handleManualMarkWatched}
            disabled={marking}
            className="text-sm text-text-dim hover:text-foreground underline underline-offset-4 transition-colors disabled:opacity-50"
          >
            Mark as watched
          </button>
        )}
      </div>
    </div>
  );
}
