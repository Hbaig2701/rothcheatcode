import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { GraduationCap, BookOpen, Video, ArrowRight } from 'lucide-react'

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
