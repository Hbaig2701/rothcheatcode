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
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-[22px_24px] transition-all duration-250 hover:bg-[rgba(255,255,255,0.045)] hover:border-[rgba(212,175,55,0.3)]">
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-4 bg-[rgba(212,175,55,0.08)] border border-[rgba(212,175,55,0.2)]">
        <Icon className="w-[18px] h-[18px] text-gold" />
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[1.5px] text-[rgba(255,255,255,0.25)] mb-2">
        {title}
      </p>
      <p className="text-[26px] font-mono font-medium text-white mb-1">{value}</p>
      <p className="text-xs text-[rgba(255,255,255,0.25)]">{subtitle}</p>
    </div>
  );
}
