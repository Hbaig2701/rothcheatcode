"use client";

import { Users, Link2 } from "lucide-react";

export function ClientsEmptyState({
  onGenerateQuestionnaire,
}: {
  onGenerateQuestionnaire?: () => void;
}) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="bg-bg-card border border-dashed border-border-default rounded-[16px] p-14 text-center max-w-md">
        <div className="w-14 h-14 rounded-full bg-accent border border-gold-border flex items-center justify-center mx-auto mb-5">
          <Users className="h-6 w-6 text-gold" />
        </div>
        <h3 className="font-display text-lg font-normal text-foreground mb-2">No clients yet</h3>
        <p className="text-sm text-text-muted mb-6 max-w-sm">
          Get started by adding your first client manually, or send them a
          questionnaire link to fill in their own details.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/clients/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-[rgba(212,175,55,0.9)] text-primary-foreground font-semibold text-sm rounded-[10px] transition-colors"
          >
            Add your first client
          </a>
          {onGenerateQuestionnaire && (
            <button
              type="button"
              onClick={onGenerateQuestionnaire}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-border-default text-foreground hover:bg-bg-input font-semibold text-sm rounded-[10px] transition-colors"
            >
              <Link2 className="h-4 w-4" />
              Send a questionnaire
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
