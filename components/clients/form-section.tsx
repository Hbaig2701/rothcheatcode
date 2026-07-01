"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Optional coordination context so an "Expand all / Collapse all" control can
// broadcast to every FormSection under it. `signal` bumps on each command so a
// section re-applies it even when re-clicked; sections still toggle on their own
// afterward. Absent (no provider) → sections just work independently.
interface FormSectionsCtx {
  signal: number;
  action: "expand" | "collapse" | null;
  expandAll: () => void;
  collapseAll: () => void;
}
const FormSectionsContext = createContext<FormSectionsCtx | null>(null);

export function FormSectionsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ signal: number; action: "expand" | "collapse" | null }>({
    signal: 0,
    action: null,
  });
  const expandAll = useCallback(() => setState((s) => ({ signal: s.signal + 1, action: "expand" })), []);
  const collapseAll = useCallback(() => setState((s) => ({ signal: s.signal + 1, action: "collapse" })), []);
  const value = useMemo<FormSectionsCtx>(
    () => ({ ...state, expandAll, collapseAll }),
    [state, expandAll, collapseAll]
  );
  return <FormSectionsContext.Provider value={value}>{children}</FormSectionsContext.Provider>;
}

/** Small, unobtrusive "Expand all · Collapse all" control. Renders nothing when
 *  not inside a FormSectionsProvider. */
export function FormSectionsToggle({ className }: { className?: string }) {
  const ctx = useContext(FormSectionsContext);
  if (!ctx) return null;
  return (
    <div className={cn("flex items-center justify-end gap-2 text-xs text-muted-foreground", className)}>
      <button type="button" onClick={ctx.expandAll} className="hover:text-foreground hover:underline">
        Expand all
      </button>
      <span aria-hidden className="text-muted-foreground/40">·</span>
      <button type="button" onClick={ctx.collapseAll} className="hover:text-foreground hover:underline">
        Collapse all
      </button>
    </div>
  );
}

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Whether the section is expanded on first render. Defaults to collapsed so
   *  the long form opens short; callers open the sections they want visible. */
  defaultOpen?: boolean;
  /** Escape hatch to render the old always-open layout (no toggle). */
  collapsible?: boolean;
}

export function FormSection({
  title,
  description,
  children,
  defaultOpen = false,
  collapsible = true,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [hasError, setHasError] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  // React to an "Expand all / Collapse all" broadcast (if a provider is present).
  const sectionsCtx = useContext(FormSectionsContext);
  const signal = sectionsCtx?.signal ?? 0;
  useEffect(() => {
    if (!sectionsCtx || sectionsCtx.action == null) return;
    setOpen(sectionsCtx.action === "expand");
    // Only re-run when the broadcast signal bumps, not on every context change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  // The section's fields stay MOUNTED even when collapsed (the body is just
  // display:none), so react-hook-form keeps validating them. Watch the subtree
  // for validation errors: if one appears while the section is closed, auto-open
  // it so nothing is hidden when the advisor hits Save — and flag the header.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => {
      const invalid = !!el.querySelector('[aria-invalid="true"], [data-invalid="true"]');
      setHasError(invalid);
      if (invalid) setOpen(true);
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(el, {
      subtree: true,
      childList: true, // conditional fields (spouse, AUM, etc.) mount/unmount
      attributes: true,
      attributeFilter: ["aria-invalid", "data-invalid"],
    });
    return () => observer.disconnect();
  }, []);

  const body = (
    <div
      id={bodyId}
      ref={bodyRef}
      className={cn(
        collapsible && !open
          ? "hidden"
          : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
        collapsible && open && "animate-in fade-in-50"
      )}
    >
      {children}
    </div>
  );

  if (!collapsible) {
    return (
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {body}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="group flex w-full cursor-pointer items-center justify-between gap-3 border-b pb-2 text-left transition-colors hover:border-foreground/40"
      >
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <span className="truncate">{title}</span>
            {hasError && (
              <span
                className="inline-flex h-2 w-2 shrink-0 rounded-full bg-destructive"
                aria-label="This section has an error"
                title="This section has an error"
              />
            )}
          </h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
            open && "rotate-180"
          )}
        />
      </button>
      {body}
    </section>
  );
}
