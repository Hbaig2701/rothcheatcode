"use client";

import { useState } from "react";
import { Play, ChevronDown } from "lucide-react";

const LOOM_PARAMS = "hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true";

interface Lesson {
  title: string;
  description: string;
  loomId: string;
}

/**
 * Expandable vertical list of training lessons. Each row's Loom iframe is
 * mounted ONLY while that row is expanded, so no videos load on page load —
 * they load on demand when the advisor opens a lesson. Multiple rows can be
 * open at once; collapsing unmounts the iframe.
 */
export function LessonList({ videos }: { videos: Lesson[] }) {
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      {videos.map((video, index) => {
        const isOpen = openIndices.has(index);
        return (
          <div
            key={video.loomId}
            className="rounded-[14px] bg-bg-card border border-border-default overflow-hidden transition-all hover:border-gold-border"
          >
            <button
              type="button"
              onClick={() => toggle(index)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-4 px-5 py-4 text-left cursor-pointer"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-accent border border-gold-border">
                <Play className="h-4 w-4 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[1.5px] text-text-dimmer mb-0.5">
                  Lesson {index + 1}
                </span>
                <h2 className="text-base font-semibold text-foreground">{video.title}</h2>
              </div>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-text-dim transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div className="px-5 pb-5">
                <p className="text-sm text-text-dim leading-relaxed mb-4">{video.description}</p>
                <div className="relative w-full aspect-video rounded-[10px] overflow-hidden border border-border-default">
                  <iframe
                    src={`https://www.loom.com/embed/${video.loomId}?${LOOM_PARAMS}`}
                    frameBorder="0"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
