import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BookOpen, ArrowLeft, ArrowRight, Clock, Lock } from 'lucide-react'
import { THEORY_MODULES } from '@/lib/training/modules'
import { CAST_BLURB } from '@/lib/training/cast'
import { ProgressSummary } from '@/components/training/progress-summary'
import { ModuleStatusBadge } from '@/components/training/module-status-badge'

export default async function TheoryIndexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="p-10 max-w-5xl">
      <Link
        href="/training"
        className="inline-flex items-center gap-1.5 text-sm text-text-dim hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to training
      </Link>

      <div className="mb-10">
        <div className="flex items-center gap-4 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <BookOpen className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Roth Conversion Theory</h1>
            <p className="text-base text-text-dim mt-0.5">
              Eight modules covering the concepts behind every conversion plan
            </p>
          </div>
        </div>

        <div className="rounded-[14px] bg-bg-card border border-border-default p-6 mt-6">
          <h2 className="text-sm font-semibold text-foreground mb-2">How this works</h2>
          <p className="text-sm text-text-dim leading-relaxed">
            Each module follows one of three example clients - <strong className="text-foreground">Bob</strong>,{' '}
            <strong className="text-foreground">Mary &amp; George</strong>, or{' '}
            <strong className="text-foreground">the Joneses</strong> - and ends with an interactive
            playground where you can change the inputs and watch the math respond. The numbers come
            from the same calculation engine that runs your real client projections.
          </p>
        </div>

        <div className="mt-4">
          <ProgressSummary allSlugs={THEORY_MODULES.map((m) => m.slug)} />
        </div>
      </div>

      <div className="space-y-3">
        {THEORY_MODULES.map((m) => {
          const isReady = m.status === 'ready'
          const Wrapper: React.ElementType = isReady ? Link : 'div'
          const wrapperProps = isReady ? { href: `/training/theory/${m.slug}` } : {}

          return (
            <Wrapper
              key={m.slug}
              {...wrapperProps}
              className={`group block rounded-[14px] bg-bg-card border border-border-default p-6 transition-all ${
                isReady ? 'hover:border-gold-border cursor-pointer' : 'opacity-60'
              }`}
            >
              <div className="flex items-start gap-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent border border-gold-border shrink-0">
                  <span className="text-sm font-display font-bold text-gold">{m.order}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-base font-semibold text-foreground">{m.title}</h3>
                    {!isReady && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-text-dimmer">
                        <Lock className="h-2.5 w-2.5" />
                        Coming soon
                      </span>
                    )}
                    {isReady && <ModuleStatusBadge slug={m.slug} />}
                  </div>
                  <p className="text-sm text-text-dim leading-relaxed mb-3">{m.tagline}</p>
                  <div className="flex items-center gap-4 text-xs text-text-dimmer">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {m.estimatedMinutes} min
                    </span>
                    <span>Featuring: {CAST_BLURB[m.cast].intro}</span>
                  </div>
                </div>

                {isReady && (
                  <div className="self-center text-text-dimmer group-hover:text-gold transition-colors">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            </Wrapper>
          )
        })}
      </div>
    </div>
  )
}
