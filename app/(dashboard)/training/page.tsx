import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { GraduationCap, BookOpen, Video, ArrowRight, PlayCircle, Clock } from 'lucide-react'

export default async function TrainingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="p-10 max-w-6xl">
      <div className="mb-10">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <GraduationCap className="h-6 w-6 text-gold" />
          </div>
          <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Training Centre</h1>
        </div>
        <p className="text-base text-text-dim ml-16">
          What do you want to learn?
        </p>
      </div>

      {/* Onboarding video — promoted above the rest of the training cards so
          new advisors land on the must-watch first thing. 30-minute Loom that
          covers the platform end-to-end. Keep this card visually distinct
          from the standard Theory / Product cards below. */}
      <Link
        href="/training/onboarding"
        className="group block mb-6 rounded-[14px] border border-gold-border bg-gradient-to-br from-accent to-bg-card p-8 transition-all hover:border-gold hover:shadow-lg"
      >
        <div className="flex items-start gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-gold/20 border border-gold-border">
            <PlayCircle className="h-9 w-9 text-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h2 className="text-xl font-display font-semibold text-foreground">
                Onboarding Video
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/15 text-gold text-[11px] font-semibold tracking-wider uppercase">
                Must watch
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-text-dim">
                <Clock className="h-3.5 w-3.5" />
                30 min
              </span>
            </div>
            <p className="text-sm text-text-dim leading-relaxed">
              New to Retirement Expert? Start here. This 30-minute walkthrough covers
              everything you need to know to use the platform end-to-end. Once you watch it,
              you&apos;ll know how to add clients, run conversion strategies, generate reports,
              and interpret the results.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-gold self-center group-hover:gap-2.5 transition-all">
            Watch now
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/training/theory"
          className="group rounded-[14px] bg-bg-card border border-border-default p-8 transition-all hover:border-gold-border hover:bg-bg-card/80 flex flex-col"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-[12px] bg-accent border border-gold-border mb-5">
            <BookOpen className="h-7 w-7 text-gold" />
          </div>
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">
            Roth Conversion Theory
          </h2>
          <p className="text-sm text-text-dim leading-relaxed mb-6 flex-1">
            Build a deep understanding of the concepts behind Roth conversions - bracket-fill,
            gross-up, RMDs, IRMAA, the widow penalty, and how annuities factor in. Each module
            includes an interactive playground tied to a real example client so you can see the
            math respond as you change the inputs.
          </p>
          <div className="flex items-center gap-1.5 text-sm font-medium text-gold group-hover:gap-2.5 transition-all">
            Start learning
            <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        <Link
          href="/training/product"
          className="group rounded-[14px] bg-bg-card border border-border-default p-8 transition-all hover:border-gold-border hover:bg-bg-card/80 flex flex-col"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-[12px] bg-accent border border-gold-border mb-5">
            <Video className="h-7 w-7 text-gold" />
          </div>
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">
            Using Retirement Expert
          </h2>
          <p className="text-sm text-text-dim leading-relaxed mb-6 flex-1">
            Step-by-step video walkthroughs covering the platform itself - adding clients,
            generating projections, customizing PDF reports, inviting team members. Get
            productive in the tool quickly.
          </p>
          <div className="flex items-center gap-1.5 text-sm font-medium text-gold group-hover:gap-2.5 transition-all">
            Watch videos
            <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      </div>
    </div>
  )
}
