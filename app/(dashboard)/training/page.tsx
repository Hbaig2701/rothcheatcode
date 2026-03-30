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
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.2)]">
            <GraduationCap className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[28px] font-display font-bold text-white leading-tight">Training Centre</h1>
            <p className="text-base text-[rgba(255,255,255,0.6)] mt-0.5">
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
            className="rounded-[14px] bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] overflow-hidden transition-all hover:border-[rgba(212,175,55,0.2)]"
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
                <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.15)]">
                  <Play className="h-3.5 w-3.5 text-gold" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.45)]">
                  Lesson {index + 1}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">{video.title}</h2>
              <p className="text-sm text-[rgba(255,255,255,0.55)] leading-relaxed">{video.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* More coming soon */}
      <div className="mt-8 rounded-[14px] bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] px-6 py-5 text-center">
        <p className="text-sm text-[rgba(255,255,255,0.45)]">
          More training videos coming soon
        </p>
      </div>
    </div>
  )
}
