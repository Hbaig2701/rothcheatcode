"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

export function DashboardEmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-12 text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-teal-500/15 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-teal-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
            />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">No CheatCodes Yet</h2>
        <p className="text-sm text-[#8b95a5] mb-8">
          Create your first client CheatCode to see your dashboard analytics and track your
          impact.
        </p>

        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create First CheatCode
        </Link>
      </div>
    </div>
  );
}
