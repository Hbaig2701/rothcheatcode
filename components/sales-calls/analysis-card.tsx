'use client';

import type { LucideIcon } from 'lucide-react';

interface AnalysisCardProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning';
}

export function AnalysisCard({ title, icon: Icon, children, variant = 'default' }: AnalysisCardProps) {
  const borderColor = {
    default: 'border-[rgba(255,255,255,0.07)]',
    success: 'border-green-500/20',
    warning: 'border-yellow-500/20',
  }[variant];

  const iconColor = {
    default: 'text-gold',
    success: 'text-green-400',
    warning: 'text-yellow-400',
  }[variant];

  return (
    <div className={`rounded-xl border ${borderColor} bg-[rgba(255,255,255,0.03)] p-5`}>
      <div className="flex items-center gap-2.5 mb-4">
        <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}
