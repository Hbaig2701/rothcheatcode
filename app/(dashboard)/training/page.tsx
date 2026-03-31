import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GraduationCap, Play } from 'lucide-react'

const LOOM_PARAMS = 'hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true'

const videos = [
  {
    title: 'Introduction to Retirement Expert',
    description: 'Get a complete overview of the platform — what it does, how it works, and how it helps you close more business.',
    loomId: 'f589bde093934180bb95bd26fe1457b7',
  },
  {
    title: 'Creating a Client',
    description: 'Walk through adding a new client, entering their financial details, and generating your first projection.',
    loomId: '28fcb6cae434460a9744b2e1b5c79d99',
  },
  {
    title: 'Adding Team Members',
    description: 'Learn how to invite team members to your account so they can collaborate on client cases.',
    loomId: 'da607e87203a4f499327b3b9018225e2',
  },
  {
    title: 'Customizing a PDF Report',
    description: 'See how to generate and customize professional PDF reports to share with your clients.',
    loomId: '1914f9854f474d90b28051524caa8b4c',
  },
]

export default async function TrainingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="p-10 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <GraduationCap className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">Training Centre</h1>
            <p className="text-base text-text-dim mt-0.5">
              Step-by-step video guides to help you get the most out of Retirement Expert
            </p>
          </div>
        </div>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {videos.map((video, index) => (
          <div
            key={video.loomId}
            className="rounded-[14px] bg-bg-card border border-border-default overflow-hidden transition-all hover:border-gold-border"
          >
            {/* Video embed — 16:9 aspect ratio */}
            <div className="relative w-full aspect-video">
              <iframe
                src={`https://www.loom.com/embed/${video.loomId}?${LOOM_PARAMS}`}
                frameBorder="0"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>

            {/* Video info */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-accent border border-gold-border">
                  <Play className="h-3.5 w-3.5 text-gold" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[1.5px] text-text-dimmer">
                  Lesson {index + 1}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">{video.title}</h2>
              <p className="text-sm text-text-dim leading-relaxed">{video.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* More coming soon */}
      <div className="mt-8 rounded-[14px] bg-bg-card border border-border-default px-6 py-5 text-center">
        <p className="text-sm text-text-dimmer">
          More training videos coming soon
        </p>
      </div>
    </div>
  )
}
