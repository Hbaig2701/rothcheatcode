import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { redirect } from "next/navigation";
import { AiChatDashboard } from "./_components/ai-chat-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminAiChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAdmin(supabase, user);

  // Count unreviewed hallucination flags so the link in the header can show
  // a badge. Cheap head query; admin client bypasses RLS. Wrapped so a
  // missing service-role env var doesn't block the dashboard from rendering.
  let unreviewedFlagCount = 0;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("chat_assistant_flags")
      .select("id", { count: "exact", head: true })
      .is("reviewed_at", null);
    unreviewedFlagCount = count ?? 0;
  } catch (err) {
    console.error("[admin/ai-chat] unreviewed flag count failed", err);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Chat</h1>
          <p className="text-sm text-text-dim mt-1 max-w-2xl">
            Usage, spend, and conversation history across all advisors using the in-app AI assistant.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/ai-chat/flags"
            className="text-sm text-text-dim hover:text-foreground transition-colors inline-flex items-center gap-2"
          >
            Hallucination flags
            {unreviewedFlagCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/20 text-gold">
                {unreviewedFlagCount}
              </span>
            )}
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/support-centre"
            className="text-sm text-text-dim hover:text-foreground transition-colors"
          >
            Support tickets →
          </Link>
        </div>
      </div>
      <AiChatDashboard />
    </div>
  );
}
