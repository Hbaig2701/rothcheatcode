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
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-2">Age {label}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Baseline:</span>
          <span className="font-mono">{formatCurrency(baseline?.value ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-blue-600">Blueprint:</span>
          <span className="font-mono">{formatCurrency(blueprint?.value ?? 0)}</span>
        </div>
        <div className="border-t pt-1 mt-1">
          <div className="flex justify-between gap-4">
            <span className="text-green-600">Difference:</span>
            <span className={cn(
              'font-mono font-medium',
              difference >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
