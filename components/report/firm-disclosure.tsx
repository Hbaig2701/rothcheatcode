"use client";

import { useUserSettings } from "@/lib/queries/settings";

/**
 * The advisor's own compliance disclosure, shown at the foot of every
 * client-facing report surface.
 *
 * Securities-licensed reps (Series 6/7/65 etc.) must carry their
 * broker-dealer's or RIA's approved language on all client communications
 * under FINRA Rule 2210. Our built-in report disclaimer is written for
 * insurance producers and does not satisfy that, so without this a registered
 * rep cannot show these reports to a client at all.
 *
 * The text is authored entirely by the advisor in Settings → Business. We
 * never supply, default, or suggest wording — getting another firm's
 * compliance language wrong is their violation and our liability.
 *
 * Rendered as plain text with `whitespace-pre-wrap`, so the advisor's line
 * breaks survive and nothing they paste can inject markup. Renders nothing
 * when unset, which is the case for every insurance-only advisor.
 */
export function FirmDisclosure({ className = "" }: { className?: string }) {
  const { data: settings } = useUserSettings();
  const text = settings?.report_disclosure?.trim();
  if (!text) return null;

  const firm = settings?.company_name?.trim();

  return (
    <div
      className={`max-w-[900px] mx-auto border-l-2 border-border pl-4 py-3 ${className}`}
    >
      <div className="text-xs font-semibold text-text-dim mb-1">
        Important Disclosures{firm ? ` — ${firm}` : ""}
      </div>
      <p className="text-xs text-text-dim whitespace-pre-wrap leading-relaxed">
        {text}
      </p>
    </div>
  );
}
