"use client";

import { Users } from "lucide-react";

export function ClientsEmptyState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="bg-[rgba(255,255,255,0.025)] border border-dashed border-[rgba(255,255,255,0.1)] rounded-[16px] p-14 text-center max-w-md">
        <div className="w-14 h-14 rounded-full bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)] flex items-center justify-center mx-auto mb-5">
          <Users className="h-6 w-6 text-gold" />
        </div>
        <h3 className="font-display text-lg font-normal text-white mb-2">No clients yet</h3>
        <p className="text-sm text-[rgba(255,255,255,0.5)] mb-6 max-w-sm">
          Get started by adding your first client to begin planning their Roth conversions.
        </p>
        <a
          href="/clients/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-[rgba(212,175,55,0.9)] text-[#0c0c0c] font-semibold text-sm rounded-[10px] transition-colors"
        >
          Add your first client
        </a>
      </div>
    </div>
  );
}
