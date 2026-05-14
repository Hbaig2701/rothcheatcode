import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { CastId } from '@/lib/training/cast';
import { CAST } from '@/lib/training/cast';

interface TryInRealClientProps {
  cast: CastId;
}

/**
 * "Try this in a real client" CTA — opens the new-client form pre-filled
 * with the featured cast member's profile. The advisor reviews, tweaks,
 * and saves as a real client they own. This turns each theory module
 * into immediate practice in their actual workflow.
 */
export function TryInRealClient({ cast }: TryInRealClientProps) {
  const c = CAST[cast];

  return (
    <Link
      href={`/clients/new?prefill=${cast}`}
      className="group block rounded-[14px] border border-gold-border bg-accent/40 p-6 transition-all hover:bg-accent/60"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-bg-card border border-gold-border shrink-0">
          <ExternalLink className="h-5 w-5 text-gold" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-[1.5px] text-gold mb-1">Try it on a real client</div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            Open {c.name} in the new-client form
          </h3>
          <p className="text-sm text-text-dim leading-relaxed">
            We&apos;ll pre-fill every field with {c.name}&apos;s profile. Adjust whatever you want —
            spouse, balances, state — and save as a fresh client in your account. The same
            calculations you just played with will run on your saved version.
          </p>
        </div>
      </div>
    </Link>
  );
}
