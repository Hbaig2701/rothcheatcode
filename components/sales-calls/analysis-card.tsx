'use client';

import type { LucideIcon } from 'lucide-react';

interface AnalysisCardProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const VARIANT_STYLES = {
  default: {
    border: 'border-border-default',
    hoverBorder: 'hover:border-border-hover',
    iconBg: 'bg-accent',
    iconBorder: 'border-gold-border',
    iconColor: 'text-gold',
  },
  success: {
    border: 'border-green-500/20',
    hoverBorder: 'hover:border-green-500/30',
    iconBg: 'bg-green-bg',
    iconBorder: 'border-green/20',
    iconColor: 'text-green-400',
  },
  warning: {
    border: 'border-yellow-500/20',
    hoverBorder: 'hover:border-yellow-500/30',
    iconBg: 'bg-[rgba(250,204,21,0.08)]',
    iconBorder: 'border-[rgba(250,204,21,0.2)]',
    iconColor: 'text-yellow-400',
  },
  danger: {
    border: 'border-red-500/20',
    hoverBorder: 'hover:border-red-500/30',
    iconBg: 'bg-red-bg',
    iconBorder: 'border-red/20',
    iconColor: 'text-red-400',
  },
};

export function AnalysisCard({ title, icon: Icon, children, variant = 'default' }: AnalysisCardProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className={`rounded-[14px] ${styles.border} bg-bg-card p-8 transition-all duration-250 hover:bg-bg-card-hover ${styles.hoverBorder}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${styles.iconBg} border ${styles.iconBorder}`}>
          <Icon className={`w-[18px] h-[18px] ${styles.iconColor}`} />
        </div>
        <h3 className="text-sm font-semibold uppercase tracking-[1.5px] text-text-muted">{title}</h3>
      </div>
      {children}
    </div>
  );
}
