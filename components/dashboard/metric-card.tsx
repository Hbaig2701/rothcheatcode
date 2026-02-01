"use client";

import { Users, DollarSign, TrendingUp, FileText, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  users: Users,
  dollar: DollarSign,
  "trending-up": TrendingUp,
  "file-text": FileText,
};

const COLOR_STYLES: Record<string, { bg: string; text: string }> = {
  teal: { bg: "bg-teal-500/15", text: "text-teal-400" },
  green: { bg: "bg-green-500/15", text: "text-green-400" },
  blue: { bg: "bg-blue-500/15", text: "text-blue-400" },
};

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  color: "teal" | "green" | "blue";
}

export function MetricCard({ title, value, subtitle, icon, color }: MetricCardProps) {
  const Icon = ICONS[icon] ?? FileText;
  const colorStyle = COLOR_STYLES[color] ?? COLOR_STYLES.teal;

  return (
    <div className="bg-[#1a2332] border border-[#2d3a4f] rounded-xl p-5 hover:bg-[#242f42] hover:border-teal-500 transition-all">
      <div
        className={`w-10 h-10 rounded-[10px] flex items-center justify-center mb-3 ${colorStyle.bg}`}
      >
        <Icon className={`w-5 h-5 ${colorStyle.text}`} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8b95a5] mb-2">
        {title}
      </p>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-[13px] text-[#5f6b7a]">{subtitle}</p>
    </div>
  );
}
