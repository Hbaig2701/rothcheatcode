import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Chat</h1>
          <p className="text-sm text-text-dim mt-1 max-w-2xl">
            Usage, spend, and conversation history across all advisors using the in-app AI assistant.
          </p>
        </div>
        <Link
          href="/support-centre"
          className="text-sm text-text-dim hover:text-foreground transition-colors"
        >
          Support tickets →
        </Link>
      </div>
      <AiChatDashboard />
    </div>
  );
}
