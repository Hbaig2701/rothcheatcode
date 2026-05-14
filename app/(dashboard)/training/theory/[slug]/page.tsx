import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ArrowLeft, ArrowRight, Clock, BookOpen } from 'lucide-react'
import { getModule, getNextModule, getPrevModule } from '@/lib/training/modules'
import { CAST_BLURB } from '@/lib/training/cast'
import { WhatIsARothConversionBody } from '@/components/training/modules/what-is-a-roth-conversion'
import { MarginalVsEffectiveTaxBody } from '@/components/training/modules/marginal-vs-effective-tax'
import { GrossUpBody } from '@/components/training/modules/gross-up'
import { RmdsBody } from '@/components/training/modules/rmds'

// Map of module slug → body component. Add an entry here as each module's
// content lands; the registry's `status: 'ready'` flag controls whether
// the curriculum index shows the module as unlockable.
const MODULE_BODIES: Record<string, React.ComponentType> = {
  'what-is-a-roth-conversion': WhatIsARothConversionBody,
  'marginal-vs-effective-tax': MarginalVsEffectiveTaxBody,
  'gross-up': GrossUpBody,
  'rmds': RmdsBody,
}

export default async function TheoryModulePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const mod = getModule(slug)
  if (!mod) notFound()

  const next = getNextModule(slug)
  const prev = getPrevModule(slug)

  return (
    <div className="p-10 max-w-4xl">
      <Link
        href="/training/theory"
        className="inline-flex items-center gap-1.5 text-sm text-text-dim hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All modules
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[1.5px] text-text-dimmer mb-3">
          <BookOpen className="h-3 w-3" />
          Module {mod.order} of 8
          <span>·</span>
          <Clock className="h-3 w-3" />
          {mod.estimatedMinutes} min
        </div>
        <h1 className="text-[32px] font-display font-bold text-foreground leading-tight mb-3">
          {mod.title}
        </h1>
        <p className="text-lg text-text-dim leading-relaxed">{mod.tagline}</p>
      </div>

      <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mb-8">
        <div className="text-xs uppercase tracking-[1.5px] text-text-dimmer mb-2">Featuring</div>
        <p className="text-sm text-foreground leading-relaxed">{CAST_BLURB[mod.cast]}</p>
      </div>

      {mod.status === 'stub' && (
        <div className="rounded-[14px] bg-bg-card border border-dashed border-border-default p-10 text-center">
          <p className="text-sm text-text-dim">
            This module is being authored. Check back soon.
          </p>
        </div>
      )}

      {mod.status === 'ready' && MODULE_BODIES[slug]
        ? (() => {
            const Body = MODULE_BODIES[slug]
            return <Body />
          })()
        : null}

      <div className="flex items-center justify-between mt-12 pt-6 border-t border-border-default">
        {prev ? (
          <Link
            href={`/training/theory/${prev.slug}`}
            className="inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <div className="text-left">
              <div className="text-[11px] uppercase tracking-wider text-text-dimmer">Previous</div>
              <div>{prev.title}</div>
            </div>
          </Link>
        ) : (
          <span />
        )}

        {next ? (
          <Link
            href={`/training/theory/${next.slug}`}
            className="inline-flex items-center gap-2 text-sm text-text-dim hover:text-foreground transition-colors text-right"
          >
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-text-dimmer">Next</div>
              <div>{next.title}</div>
            </div>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
