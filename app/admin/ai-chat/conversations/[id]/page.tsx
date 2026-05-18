import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { redirect } from "next/navigation";
import { ConversationDetail } from "./_components/conversation-detail";

export const dynamic = "force-dynamic";

export default async function AdminConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAdmin(supabase, user);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/ai-chat"
        className="inline-flex items-center gap-1.5 text-sm text-text-dim hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to AI Chat
      </Link>
      <ConversationDetail conversationId={id} />
    </div>
  );
}
