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
    <div className="p-10">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-4 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.2)]">
            <GraduationCap className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-[32px] font-display font-bold text-white leading-tight">Training Centre</h1>
            <p className="text-base text-[rgba(255,255,255,0.6)] mt-1">
              Step-by-step video guides to help you get the most out of Retirement Expert
            </p>
          </div>
        </div>
      </div>

      {/* Videos */}
      <div className="space-y-10">
        {videos.map((video, index) => (
          <div
            key={video.loomId}
            className="rounded-[14px] bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] overflow-hidden transition-all hover:border-[rgba(212,175,55,0.2)]"
          >
            {/* Video embed */}
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.loom.com/embed/${video.loomId}?${LOOM_PARAMS}`}
                frameBorder="0"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>

            {/* Video info */}
            <div className="px-8 py-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.15)]">
                  <Play className="h-4 w-4 text-gold" />
                </div>
                <span className="text-sm font-semibold uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)]">
                  Lesson {index + 1}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">{video.title}</h2>
              <p className="text-base text-[rgba(255,255,255,0.6)]">{video.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* More coming soon */}
      <div className="mt-10 rounded-[14px] bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] px-8 py-6 text-center">
        <p className="text-base text-[rgba(255,255,255,0.5)]">
          More training videos coming soon — check back regularly for new content.
        </p>
      </div>
    </div>
  )
}
