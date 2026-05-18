"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Typewriter buffer for streaming assistant text.
 *
 * Anthropic SSE chunks arrive at uneven sizes and intervals — a 30-char
 * burst followed by a 200ms pause feels jerky if you render directly.
 * This hook buffers incoming text and reveals it at a steady character
 * rate, so the UI feels like the assistant is "typing" smoothly.
 *
 * When the stream completes (revealAll), any remaining buffered text is
 * flushed immediately so the bubble doesn't get stuck mid-sentence.
 */

interface TypewriterOptions {
  // Characters revealed per second. Default ~80 — fast enough to keep up
  // with typical Claude output (~30-100 chars/s) but smooth enough to
  // animate cleanly.
  charsPerSecond?: number;
  // Cap below which the buffer is flushed immediately. Stops the cursor
  // from racing ahead if the model out-paces our reveal rate.
  maxBufferChars?: number;
}

export interface TypewriterApi {
  // The fully-revealed text so far. Use this as the bubble's content.
  text: string;
  // Append a chunk that just arrived from the stream.
  append: (chunk: string) => void;
  // Mark the stream as ended (no more chunks coming). Returns a Promise
  // that resolves once the typewriter has naturally revealed everything
  // in the buffer. The caller can `await` it to defer handoff to the
  // persisted message until the reveal looks complete.
  finish: () => Promise<void>;
  // Reset to empty state (use when starting a new message).
  reset: () => void;
}

export function useTypewriter({
  charsPerSecond = 35,
  maxBufferChars = 4000,
}: TypewriterOptions = {}): TypewriterApi {
  const [text, setText] = useState("");
  // Queue of un-revealed characters. A ref instead of state because the
  // timer mutates it many times per second; we don't want a render per mutation.
  const queueRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  function ensureTimer() {
    if (timerRef.current) return;
    // Reveal at a steady rate matching charsPerSecond. No more burst
    // acceleration based on backlog — that was causing short messages to
    // feel abrupt: typewriter would dump the rest the moment the model
    // out-paced 90 cps. Now the reveal stays calm and lets the advisor
    // actually read along.
    const tickMs = 1000 / 30; // 30 fps
    timerRef.current = setInterval(() => {
      const queue = queueRef.current;
      if (queue.length === 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      // Steady per-tick reveal — base rate calibrated for tickMs.
      let n = Math.max(1, Math.round(charsPerSecond / 30));
      // Soft floor for absurd backlogs (>4KB queued). Even then, cap at
      // 2× base rate so the reveal stays smooth — never a jarring dump.
      if (queue.length > maxBufferChars) n = n * 2;

      const slice = queue.slice(0, n);
      queueRef.current = queue.slice(n);
      setText((prev) => prev + slice);
    }, tickMs);
  }

  function append(chunk: string) {
    if (!chunk) return;
    finishedRef.current = false;
    queueRef.current += chunk;
    ensureTimer();
  }

  function finish(): Promise<void> {
    finishedRef.current = true;
    // Don't flush — let the buffered text reveal at its normal rate. The
    // returned promise resolves once the queue empties so callers can
    // await the natural completion before handing off to the persisted
    // message. Hard 30s ceiling to guard against a stuck timer.
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (queueRef.current.length === 0) {
          resolve();
        } else if (Date.now() - start > 30_000) {
          // Safety: don't hang forever. Flush the rest and resolve.
          const remaining = queueRef.current;
          queueRef.current = "";
          setText((prev) => prev + remaining);
          resolve();
        } else {
          setTimeout(tick, 50);
        }
      };
      tick();
    });
  }

  function reset() {
    finishedRef.current = false;
    queueRef.current = "";
    setText("");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { text, append, finish, reset };
}
