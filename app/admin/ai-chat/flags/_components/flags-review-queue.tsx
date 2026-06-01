"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "unreviewed" | "reviewed" | "all";

interface Flag {
  id: string;
  created_at: string;
  reviewed_at: string | null;
  reviewer: { id: string; email: string | null } | null;
  reviewer_note: string | null;
  flags: string[];
  advisor: { id: string; email: string | null };
  conversation: { id: string; title: string | null };
  flagged_message: { id: string; content: string; created_at: string } | null;
  prior_user_message: { content: string; created_at: string } | null;
}

interface ListResponse {
  flags: Flag[];
  nextCursor: string | null;
  unreviewedCount: number;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function FlagsReviewQueue() {
  const [status, setStatus] = useState<Status>("unreviewed");
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "chat-flags", status],
    queryFn: async (): Promise<ListResponse> => {
      const res = await fetch(`/api/admin/chat-flags?status=${status}&limit=50`);
      if (!res.ok) throw new Error("Failed to load flags");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "review" | "unreview"; note?: string }) => {
      const res = await fetch(`/api/admin/chat-flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) throw new Error("Failed to update flag");
    },
    // Refresh every tab — counts on the unreviewed badge across the app.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "chat-flags"] }),
  });

  if (isLoading) {
    return <p className="text-sm text-text-dim">Loading flags…</p>;
  }
  if (error || !data) {
    return (
      <p className="text-sm text-red-500">
        Failed to load flags. The `chat_assistant_flags` table may not be migrated yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <FilterTabs value={status} onChange={setStatus} unreviewedCount={data.unreviewedCount} />
        <p className="text-xs text-text-dim">
          Showing {data.flags.length} {data.flags.length === 1 ? "flag" : "flags"}
        </p>
      </div>

      {data.flags.length === 0 ? (
        <div className="rounded-lg border border-border-default p-8 text-center">
          <p className="text-sm text-text-dim">
            {status === "unreviewed"
              ? "Nothing to review. The bot is behaving — or the guard hasn't tripped on anything yet."
              : status === "reviewed"
                ? "No reviewed flags yet."
                : "No flags recorded."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.flags.map((f) => (
            <FlagCard
              key={f.id}
              flag={f}
              onReview={(note) => reviewMutation.mutate({ id: f.id, action: "review", note })}
              onUnreview={() => reviewMutation.mutate({ id: f.id, action: "unreview" })}
              pending={reviewMutation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
  unreviewedCount,
}: {
  value: Status;
  onChange: (v: Status) => void;
  unreviewedCount: number;
}) {
  const tab = (key: Status, label: string, badge?: number) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      className={cn(
        "px-3 py-1.5 text-sm rounded-full transition-colors inline-flex items-center gap-2",
        value === key
          ? "bg-bg-card-hover text-foreground border border-border-default"
          : "text-text-dim hover:text-foreground",
      )}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full",
            value === key ? "bg-gold/20 text-gold" : "bg-bg-card text-text-muted",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1 bg-bg-card border border-border-default rounded-full p-1">
      {tab("unreviewed", "Unreviewed", unreviewedCount)}
      {tab("reviewed", "Reviewed")}
      {tab("all", "All")}
    </div>
  );
}

function FlagCard({
  flag,
  onReview,
  onUnreview,
  pending,
}: {
  flag: Flag;
  onReview: (note: string) => void;
  onUnreview: () => void;
  pending: boolean;
}) {
  const [note, setNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const isReviewed = !!flag.reviewed_at;

  return (
    <li
      className={cn(
        "rounded-lg border bg-bg-card p-4 space-y-3",
        isReviewed ? "border-border-default/40 opacity-70" : "border-border-default",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-text-dim">
            <span>{timeAgo(flag.created_at)}</span>
            <span>·</span>
            <span className="truncate">{flag.advisor.email ?? flag.advisor.id.slice(0, 8)}</span>
            <span>·</span>
            <Link
              href={`/admin/ai-chat/conversations/${flag.conversation.id}`}
              className="text-text-dim hover:text-foreground inline-flex items-center gap-1"
            >
              <MessageSquare className="h-3 w-3" />
              <span>{flag.conversation.title ?? "conversation"}</span>
            </Link>
          </div>
          <ul className="space-y-1">
            {flag.flags.map((label, i) => (
              <li
                key={i}
                className="text-sm text-foreground leading-snug pl-2 border-l-2 border-gold"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
        {!isReviewed ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {showNoteInput ? (
              <>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note (KB fix, false positive, etc.)"
                  className="text-xs px-2 py-1 rounded border border-border-default bg-bg-card-hover w-64"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    onReview(note);
                    setShowNoteInput(false);
                    setNote("");
                  }}
                  className="text-xs px-2 py-1 rounded bg-gold text-primary-foreground hover:bg-gold/90 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowNoteInput(false)}
                  className="text-xs px-2 py-1 rounded text-text-dim hover:text-foreground"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onReview("")}
                  className="text-xs px-2 py-1 rounded border border-border-default hover:bg-bg-card-hover inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                  Mark reviewed
                </button>
                <button
                  type="button"
                  onClick={() => setShowNoteInput(true)}
                  className="text-xs px-2 py-1 rounded text-text-dim hover:text-foreground"
                >
                  + note
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={onUnreview}
            className="text-xs px-2 py-1 rounded text-text-dim hover:text-foreground inline-flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reopen
          </button>
        )}
      </div>

      {flag.prior_user_message && (
        <div className="rounded bg-bg-card-hover/50 p-2.5 text-xs">
          <div className="text-text-dim uppercase tracking-wider text-[10px] mb-1">
            Advisor asked
          </div>
          <p className="text-foreground leading-snug whitespace-pre-wrap line-clamp-3">
            {flag.prior_user_message.content}
          </p>
        </div>
      )}
      {flag.flagged_message && (
        <div className="rounded bg-bg-card-hover/50 p-2.5 text-xs">
          <div className="text-text-dim uppercase tracking-wider text-[10px] mb-1">
            Bot replied
          </div>
          <p className="text-foreground leading-snug whitespace-pre-wrap line-clamp-6">
            {flag.flagged_message.content}
          </p>
        </div>
      )}

      {isReviewed && (
        <div className="text-xs text-text-dim border-t border-border-default/40 pt-2">
          Reviewed {timeAgo(flag.reviewed_at!)}
          {flag.reviewer?.email ? ` by ${flag.reviewer.email}` : ""}
          {flag.reviewer_note ? ` — "${flag.reviewer_note}"` : ""}
        </div>
      )}
    </li>
  );
}
