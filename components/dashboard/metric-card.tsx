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
    <div className="bg-bg-card border border-border-default rounded-[14px] p-[22px_24px] transition-all duration-250 hover:bg-bg-card-hover hover:border-border-hover">
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-4 bg-accent border border-gold-border">
        <Icon className="w-[18px] h-[18px] text-gold" />
      </div>
      <p className="text-xs font-medium uppercase tracking-[1.5px] text-text-muted mb-2">
        {title}
      </p>
      <p className="text-[28px] font-mono font-medium text-foreground mb-1">{value}</p>
      <p className="text-sm text-text-dim">{subtitle}</p>
    </div>
  );
}
