'use client';

import CountUp from 'react-countup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number;        // In cents
  prefix?: string;      // e.g., '$'
  suffix?: string;      // e.g., '%'
  decimals?: number;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;  // e.g., "+$45,000 vs Baseline"
  className?: string;
  highlight?: boolean;  // Add border emphasis
}

export function StatCard({
  title,
  value,
  prefix = '$',
  suffix = '',
  decimals = 0,
  trend,
  trendLabel,
  className,
  highlight = false,
}: StatCardProps) {
  // Convert cents to dollars for display
  const displayValue = value / 100;

  const TrendIcon = trend === 'up' ? TrendingUp
                  : trend === 'down' ? TrendingDown
                  : Minus;

  const trendColor = trend === 'up' ? 'text-green-600'
                   : trend === 'down' ? 'text-red-600'
                   : 'text-muted-foreground';

  return (
    <Card className={cn(
      '',
      highlight && 'border-blue-500 border-2',
      className
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          <CountUp
            start={0}
            end={displayValue}
            duration={2}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
            separator=","
            useEasing={true}
            enableScrollSpy={false}  // Trigger immediately on mount
          />
        </div>
        {trend && trendLabel && (
          <div className={cn('flex items-center gap-1 mt-1 text-sm', trendColor)}>
            <TrendIcon className="h-4 w-4" />
            <span>{trendLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
