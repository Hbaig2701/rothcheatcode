import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PlayCircle, ArrowLeft, Clock, BookOpen, Video } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OnboardingVideoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="p-10 max-w-5xl">
      <div className="mb-6">
        <Link
          href="/training"
          className="inline-flex items-center gap-1.5 text-sm text-text-dim hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Training Centre
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-4 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent border border-gold-border">
            <PlayCircle className="h-6 w-6 text-gold" />
          </div>
          <h1 className="text-[28px] font-display font-bold text-foreground leading-tight">
            Onboarding Video
          </h1>
        </div>
        <div className="flex items-center gap-3 ml-16 text-sm text-text-dim">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 text-gold text-xs font-semibold tracking-wide uppercase">
            Must watch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            30 minutes
          </span>
          <span>·</span>
          <span>Start here if you&apos;re new to Retirement Expert</span>
        </div>
      </div>

      {/* Loom embed — responsive 16:9-ish aspect ratio per Loom's snippet */}
      <div className="rounded-[14px] overflow-hidden border border-border-default bg-bg-card shadow-lg">
        <div style={{ position: "relative", paddingBottom: "56.470588235294116%", height: 0 }}>
          <iframe
            src="https://www.loom.com/embed/bd3597328d384a0e8b444e5975713a46"
            allowFullScreen
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: 0,
            }}
            title="Retirement Expert onboarding video"
          />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/training/theory"
          className="group rounded-[12px] bg-bg-card border border-border-default p-5 transition-all hover:border-gold-border hover:bg-bg-card/80"
        >
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-5 w-5 text-gold" />
            <p className="font-display font-semibold text-foreground">
              Roth Conversion Theory
            </p>
          </div>
          <p className="text-sm text-text-dim leading-relaxed">
            Deep-dive interactive modules covering bracket fill, RMDs, IRMAA, and more.
          </p>
        </Link>
        <Link
          href="/training/product"
          className="group rounded-[12px] bg-bg-card border border-border-default p-5 transition-all hover:border-gold-border hover:bg-bg-card/80"
        >
          <div className="flex items-center gap-3 mb-2">
            <Video className="h-5 w-5 text-gold" />
            <p className="font-display font-semibold text-foreground">
              Using Retirement Expert
            </p>
          </div>
          <p className="text-sm text-text-dim leading-relaxed">
            Step-by-step product walkthroughs for adding clients, generating reports, and more.
          </p>
        </Link>
      </div>
    </div>
  );
}
