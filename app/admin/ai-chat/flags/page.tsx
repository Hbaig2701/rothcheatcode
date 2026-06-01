import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { redirect } from "next/navigation";
import { FlagsReviewQueue } from "./_components/flags-review-queue";

export const dynamic = "force-dynamic";

export default async function AdminChatFlagsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAdmin(supabase, user);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Chat hallucination flags
          </h1>
          <p className="text-sm text-text-dim mt-1 max-w-2xl">
            Bot responses the post-response guard tripped on. Each entry
            shows the suspect claim, the assistant message, and the prior
            user turn. Mark reviewed once you&apos;ve either decided it&apos;s a
            false positive or shipped a KB / prompt fix.
          </p>
        </div>
        <Link
          href="/admin/ai-chat"
          className="text-sm text-text-dim hover:text-foreground transition-colors"
        >
          ← AI Chat dashboard
        </Link>
      </div>
      <FlagsReviewQueue />
    </div>
  );
}
