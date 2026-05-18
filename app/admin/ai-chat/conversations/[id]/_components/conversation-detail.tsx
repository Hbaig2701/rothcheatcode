"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageBubble } from "@/components/chat/message-bubble";
import type { ChatMessage } from "@/lib/types/chat";

interface DetailResponse {
  conversation: {
    id: string;
    user_id: string;
    title: string | null;
    last_message_at: string;
    archived: boolean;
    created_at: string;
  };
  advisor: { id: string; name: string; email: string | null };
  messages: ChatMessage[];
}

function formatUSD(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount < 10 ? 4 : 2,
  });
}

export function ConversationDetail({ conversationId }: { conversationId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "ai-chat", "conversation", conversationId],
    queryFn: async (): Promise<DetailResponse> => {
      const res = await fetch(`/api/admin/ai-chat/conversations/${conversationId}`);
      if (!res.ok) throw new Error("Failed to load conversation");
      return res.json();
    },
  });

  if (isLoading) return <p className="text-sm text-text-dim">Loading…</p>;
  if (error || !data) return <p className="text-sm text-red-500">Failed to load conversation.</p>;

  // Roll up totals for the header.
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  for (const m of data.messages) {
    totalCost += Number(m.cost_usd ?? 0);
    totalIn += m.input_tokens ?? 0;
    totalOut += m.output_tokens ?? 0;
    totalCacheRead += m.cache_read_tokens ?? 0;
    totalCacheCreate += m.cache_creation_tokens ?? 0;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border-default bg-bg-card p-5">
        <h1 className="text-xl font-semibold text-foreground">
          {data.conversation.title || "Untitled conversation"}
        </h1>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Advisor" value={data.advisor.name} sub={data.advisor.email ?? undefined} />
          <Field
            label="Started"
            value={new Date(data.conversation.created_at).toLocaleString()}
          />
          <Field
            label="Last activity"
            value={new Date(data.conversation.last_message_at).toLocaleString()}
          />
          <Field label="Total spend" value={formatUSD(totalCost)} />
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-text-dim">
          <Field label="Input tokens" value={totalIn.toLocaleString()} />
          <Field label="Output tokens" value={totalOut.toLocaleString()} />
          <Field label="Cache reads" value={totalCacheRead.toLocaleString()} />
          <Field label="Cache writes" value={totalCacheCreate.toLocaleString()} />
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-card p-5">
        <h2 className="text-sm font-medium text-foreground mb-4">Transcript</h2>
        <div className="space-y-3">
          {data.messages.length === 0 ? (
            <p className="text-sm text-text-dim">No messages.</p>
          ) : (
            data.messages.map((m) => (
              <div key={m.id} className="space-y-1">
                <MessageBubble message={m} />
                {m.role === "assistant" && (m.cost_usd ?? 0) > 0 && (
                  <div className="text-[10px] text-text-dim pl-1">
                    {m.model} · {(m.input_tokens ?? 0).toLocaleString()} in /
                    {(m.output_tokens ?? 0).toLocaleString()} out · {formatUSD(Number(m.cost_usd))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
      {sub && <div className="text-xs text-text-dim">{sub}</div>}
    </div>
  );
}
