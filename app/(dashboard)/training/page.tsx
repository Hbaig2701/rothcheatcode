import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Video, Clock } from 'lucide-react'

export default async function TrainingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Only admins can access Training for now
  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <div className="container max-w-6xl py-8 px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Video Tutorials</h1>
        <p className="text-[rgba(255,255,255,0.6)]">
          Learn how to maximize Retirement Expert with step-by-step video guides
        </p>
      </div>

      {/* Getting Started Section */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Video className="w-5 h-5 text-[#d4af37]" />
          Getting Started
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VideoCard
            title="Welcome to Retirement Expert"
            duration="3:45"
            loomUrl="https://www.loom.com/share/YOUR_VIDEO_ID_1"
            description="Overview of the platform and key features"
          />
          <VideoCard
            title="Creating Your First Client"
            duration="5:20"
            loomUrl="https://www.loom.com/share/YOUR_VIDEO_ID_2"
            description="Step-by-step guide to adding a new client"
          />
        </div>
      </section>

      {/* Creating Projections Section */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Video className="w-5 h-5 text-[#d4af37]" />
          Creating Projections
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VideoCard
            title="Understanding Product Presets"
            duration="4:15"
            loomUrl="https://www.loom.com/share/YOUR_VIDEO_ID_3"
            description="How to use product presets for faster setup"
          />
          <VideoCard
            title="Customizing Projections"
            duration="6:30"
            loomUrl="https://www.loom.com/share/YOUR_VIDEO_ID_4"
            description="Advanced options and customization techniques"
          />
        </div>
      </section>

      {/* Advanced Features Section */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Video className="w-5 h-5 text-[#d4af37]" />
          Advanced Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VideoCard
            title="Generating Professional Reports"
            duration="5:00"
            loomUrl="https://www.loom.com/share/YOUR_VIDEO_ID_5"
            description="Create and customize client-ready reports"
          />
          <VideoCard
            title="Comparing Scenarios"
            duration="7:10"
            loomUrl="https://www.loom.com/share/YOUR_VIDEO_ID_6"
            description="Side-by-side scenario analysis techniques"
          />
        </div>
      </section>

      {/* Admin Note */}
      <div className="mt-12 p-4 bg-[rgba(212,175,55,0.1)] border border-[rgba(212,175,55,0.2)] rounded-lg">
        <p className="text-sm text-[rgba(255,255,255,0.7)]">
          <strong className="text-[#d4af37]">Admin Note:</strong> This page is currently only visible to admins.
          To make it available to all users, remove the role check in the page component.
        </p>
      </div>
    </div>
  )
}

function VideoCard({
  title,
  duration,
  loomUrl,
  description,
}: {
  title: string
  duration: string
  loomUrl: string
  description: string
}) {
  // Extract video ID from Loom URL (format: https://www.loom.com/share/VIDEO_ID)
  const videoId = loomUrl.split('/').pop()
  const isPlaceholder = videoId?.startsWith('YOUR_VIDEO_ID')

  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden hover:border-[rgba(212,175,55,0.3)] transition-colors">
      {/* Video Embed or Placeholder */}
      <div className="aspect-video bg-[rgba(0,0,0,0.5)] relative">
        {isPlaceholder ? (
          // Placeholder for videos not yet added
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Video className="w-12 h-12 text-[rgba(255,255,255,0.3)] mx-auto mb-2" />
              <p className="text-sm text-[rgba(255,255,255,0.5)]">Video coming soon</p>
            </div>
          </div>
        ) : (
          // Loom embed (responsive)
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
            <iframe
              src={`https://www.loom.com/embed/${videoId}`}
              frameBorder="0"
              allowFullScreen
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
              }}
            />
          </div>
        )}
      </div>

      {/* Video Info */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <div className="flex items-center gap-1 text-xs text-[rgba(255,255,255,0.5)] ml-2 shrink-0">
            <Clock className="w-3 h-3" />
            {duration}
          </div>
        </div>
        <p className="text-sm text-[rgba(255,255,255,0.6)]">{description}</p>
      </div>
    </div>
  )
}
