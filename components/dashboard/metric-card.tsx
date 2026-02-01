"use client";

import { Users, DollarSign, TrendingUp, FileText, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  users: Users,
  dollar: DollarSign,
  "trending-up": TrendingUp,
  "file-text": FileText,
};

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
}

export function MetricCard({ title, value, subtitle, icon }: MetricCardProps) {
  const Icon = ICONS[icon] ?? FileText;

  return (
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5 hover:bg-[#1F1F1F] hover:border-[#F5B800] transition-all">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[#F5B800]/15 border border-[#F5B800]/30">
        <Icon className="w-5 h-5 text-[#F5B800]" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#A0A0A0] mb-2">
        {title}
      </p>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-[13px] text-[#6B6B6B]">{subtitle}</p>
    </div>
  );
}
