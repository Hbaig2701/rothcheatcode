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
  // Flush any remaining buffered text and stop the timer. Call this when
  // the stream's `done` event arrives.
  finish: () => void;
  // Reset to empty state (use when starting a new message).
  reset: () => void;
}

export function useTypewriter({
  charsPerSecond = 80,
  maxBufferChars = 600,
}: TypewriterOptions = {}): TypewriterApi {
  const [text, setText] = useState("");
  // Queue of un-revealed characters. A ref instead of state because the
  // timer mutates it many times per second; we don't want a render per mutation.
  const queueRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  function ensureTimer() {
    if (timerRef.current) return;
    // Reveal roughly charsPerSecond / 50fps = 1-2 chars per tick. We
    // compute the per-tick count from queue size to keep up under heavy
    // chunk bursts.
    const tickMs = 1000 / 50;
    timerRef.current = setInterval(() => {
      const queue = queueRef.current;
      if (queue.length === 0) {
        // Nothing to reveal — pause the timer until next append.
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      // Base per-tick reveal rate.
      let n = Math.max(1, Math.round(charsPerSecond / 50));
      // If we're falling far behind, accelerate so the cursor doesn't
      // get stuck minutes behind the model. Speed scales with backlog.
      if (queue.length > maxBufferChars) n = queue.length;
      else if (queue.length > 200) n = Math.max(n, Math.ceil(queue.length / 40));

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

  function finish() {
    finishedRef.current = true;
    if (queueRef.current.length > 0) {
      const remaining = queueRef.current;
      queueRef.current = "";
      setText((prev) => prev + remaining);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
