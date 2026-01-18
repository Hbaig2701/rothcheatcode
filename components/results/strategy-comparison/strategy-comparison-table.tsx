'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { BestBadge } from './best-badge';
import {
  MultiStrategyResult,
  StrategyType
} from '@/lib/calculations/types';
import {
  STRATEGY_DEFINITIONS,
  STRATEGIES
} from '@/lib/calculations/strategy-definitions';
import { cn } from '@/lib/utils';

interface StrategyComparisonTableProps {
  result: MultiStrategyResult;
  selectedStrategy?: StrategyType;
  onStrategySelect?: (strategy: StrategyType) => void;
}

/**
 * Format cents as currency string
 */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Format a positive number with + prefix for tax savings
 */
function formatSavings(cents: number): string {
  if (cents <= 0) return '$0';
  return '+' + formatCurrency(cents);
}

/**
 * 4-column comparison table showing all strategies side-by-side
 * Best strategy column is highlighted with primary/10 background
 */
export function StrategyComparisonTable({
  result,
  selectedStrategy,
  onStrategySelect
}: StrategyComparisonTableProps) {
  const { bestStrategy, comparisonMetrics } = result;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Horizontal scroll container for mobile */}
      <div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px] font-semibold">Metric</TableHead>
              {STRATEGIES.map(strategy => (
                <TableHead
                  key={strategy}
                  className={cn(
                    'text-center min-w-[130px]',
                    strategy === bestStrategy && 'bg-primary/10'
                  )}
                >
                  <div className="flex flex-col items-center gap-1 py-1">
                    <span className="font-semibold">
                      {STRATEGY_DEFINITIONS[strategy].name}
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {STRATEGY_DEFINITIONS[strategy].description}
                    </span>
                    {strategy === bestStrategy && <BestBadge />}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Ending Wealth Row */}
            <TableRow>
              <TableCell className="font-medium">Ending Wealth</TableCell>
              {STRATEGIES.map(strategy => (
                <TableCell
                  key={strategy}
                  className={cn(
                    'text-center font-mono text-sm',
                    strategy === bestStrategy && 'bg-primary/10 font-semibold'
                  )}
                >
                  {formatCurrency(comparisonMetrics[strategy].endingWealth)}
                </TableCell>
              ))}
            </TableRow>

            {/* Lifetime Tax Savings Row */}
            <TableRow>
              <TableCell className="font-medium">Tax Savings</TableCell>
              {STRATEGIES.map(strategy => (
                <TableCell
                  key={strategy}
                  className={cn(
                    'text-center font-mono text-sm',
                    strategy === bestStrategy && 'bg-primary/10',
                    comparisonMetrics[strategy].taxSavings > 0 && 'text-green-600'
                  )}
                >
                  {formatSavings(comparisonMetrics[strategy].taxSavings)}
                </TableCell>
              ))}
            </TableRow>

            {/* Breakeven Age Row */}
            <TableRow>
              <TableCell className="font-medium">Breakeven Age</TableCell>
              {STRATEGIES.map(strategy => (
                <TableCell
                  key={strategy}
                  className={cn(
                    'text-center text-sm',
                    strategy === bestStrategy && 'bg-primary/10'
                  )}
                >
                  {comparisonMetrics[strategy].breakEvenAge ?? 'N/A'}
                </TableCell>
              ))}
            </TableRow>

            {/* IRMAA Surcharges Row */}
            <TableRow>
              <TableCell className="font-medium">IRMAA Surcharges</TableCell>
              {STRATEGIES.map(strategy => (
                <TableCell
                  key={strategy}
                  className={cn(
                    'text-center font-mono text-sm',
                    strategy === bestStrategy && 'bg-primary/10',
                    comparisonMetrics[strategy].totalIRMAA > 0 && 'text-amber-600'
                  )}
                >
                  {comparisonMetrics[strategy].totalIRMAA === 0
                    ? '$0'
                    : formatCurrency(comparisonMetrics[strategy].totalIRMAA)
                  }
                </TableCell>
              ))}
            </TableRow>

            {/* Heir Benefit Row */}
            <TableRow>
              <TableCell className="font-medium">Heir Benefit</TableCell>
              {STRATEGIES.map(strategy => (
                <TableCell
                  key={strategy}
                  className={cn(
                    'text-center font-mono text-sm',
                    strategy === bestStrategy && 'bg-primary/10',
                    comparisonMetrics[strategy].heirBenefit > 0 && 'text-green-600'
                  )}
                >
                  {formatSavings(comparisonMetrics[strategy].heirBenefit)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Strategy Selection Row */}
      {onStrategySelect && (
        <div className="grid grid-cols-5 gap-2 p-4 border-t bg-muted/30">
          <div className="flex items-center text-sm font-medium text-muted-foreground">
            View Details
          </div>
          {STRATEGIES.map(strategy => (
            <Button
              key={strategy}
              variant={selectedStrategy === strategy ? 'default' : 'outline'}
              size="sm"
              onClick={() => onStrategySelect(strategy)}
              className={cn(
                'w-full',
                strategy === bestStrategy && selectedStrategy !== strategy &&
                  'border-primary/50'
              )}
            >
              {selectedStrategy === strategy ? 'Selected' : 'Select'}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
