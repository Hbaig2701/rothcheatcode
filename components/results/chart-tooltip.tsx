'use client';

import { formatCurrency } from '@/lib/calculations/transforms';
import { cn } from '@/lib/utils';

interface PayloadItem {
  dataKey: string;
  value: number;
  name: string;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: PayloadItem[];
  label?: string | number;
}

export function ChartTooltip({
  active,
  payload,
  label,
}: ChartTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const baseline = payload.find(p => p.dataKey === 'baseline');
  const blueprint = payload.find(p => p.dataKey === 'blueprint');
  const difference = blueprint && baseline
    ? blueprint.value - baseline.value
    : 0;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="font-semibold text-slate-200 mb-2">Age {label}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-6">
          <span className="text-emerald-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Blueprint:
          </span>
          <span className="font-mono text-slate-200">{formatCurrency(blueprint?.value ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-red-400 flex items-center gap-2">
            <span className="w-2 h-0.5 bg-red-500"></span>
            Baseline:
          </span>
          <span className="font-mono text-slate-200">{formatCurrency(baseline?.value ?? 0)}</span>
        </div>
        <div className="border-t border-slate-700 pt-2 mt-2">
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">Advantage:</span>
            <span className={cn(
              'font-mono font-semibold',
              difference >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
