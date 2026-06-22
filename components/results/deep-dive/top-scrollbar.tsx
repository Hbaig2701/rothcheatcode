'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Always-visible, mouse-draggable horizontal scrollbar pinned to the TOP of a
 * scroll container. Native scrollbars on macOS auto-hide (overlay), so a
 * mouse/Windows user with no trackpad swipe can't scroll wide tables. This
 * renders a real track + thumb that's always on screen and grabbable, and stays
 * in sync with trackpad/native scrolling of the target. (Greg Stopp / Dr.
 * Policar ticket.)
 */
export function TopScrollbar({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const [m, setM] = useState({ scrollWidth: 0, clientWidth: 0, scrollLeft: 0 });

  // Mirror the target's scroll metrics. Re-reads on scroll, resize, and one
  // rAF after mount (column widths/fonts can settle a frame late).
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const update = () =>
      setM({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollLeft: el.scrollLeft });
    update();
    const raf = requestAnimationFrame(update);
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const table = el.querySelector('table');
    if (table) ro.observe(table);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [targetRef]);

  const overflowing = m.scrollWidth - m.clientWidth > 1;
  // Thumb geometry as a fraction of the track. Max scrollLeft is
  // (scrollWidth - clientWidth), at which point the thumb's right edge hits 100%.
  const thumbWidthPct = overflowing ? Math.max(8, (m.clientWidth / m.scrollWidth) * 100) : 100;
  const thumbLeftPct = overflowing ? (m.scrollLeft / m.scrollWidth) * 100 : 0;

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = targetRef.current;
      if (!el) return;
      dragRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft };
      const onMove = (ev: MouseEvent) => {
        const track = trackRef.current;
        const target = targetRef.current;
        if (!track || !target || !dragRef.current) return;
        // Pixels dragged on the track → proportional scroll on the content.
        const scrollDelta = ((ev.clientX - dragRef.current.startX) / track.clientWidth) * target.scrollWidth;
        target.scrollLeft = dragRef.current.startScrollLeft + scrollDelta;
      };
      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [targetRef]
  );

  // Click anywhere on the track (not the thumb) → jump-scroll to center on it.
  const jumpToClick = useCallback(
    (e: React.MouseEvent) => {
      const track = trackRef.current;
      const target = targetRef.current;
      if (!track || !target) return;
      const rect = track.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      target.scrollLeft = frac * target.scrollWidth - target.clientWidth / 2;
    },
    [targetRef]
  );

  if (!overflowing) return null;

  return (
    <div className="border-b border-border-default bg-bg-input px-2 py-2">
      <div
        ref={trackRef}
        onMouseDown={jumpToClick}
        className="relative h-2.5 rounded-full bg-border-default/50 cursor-pointer"
      >
        <div
          onMouseDown={startDrag}
          className="absolute top-0 h-2.5 rounded-full bg-text-muted hover:bg-foreground/70 active:bg-foreground cursor-grab active:cursor-grabbing transition-colors"
          style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
        />
      </div>
    </div>
  );
}
