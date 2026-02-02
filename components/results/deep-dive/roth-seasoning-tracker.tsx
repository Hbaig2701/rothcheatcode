'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { YearlyResult } from '@/lib/calculations/types';
import { formatCurrency } from '@/lib/calculations/transforms';
import { cn } from '@/lib/utils';

/**
 * Represents a single Roth conversion cohort for 5-year rule tracking
 */
interface ConversionCohort {
  conversionYear: number;
  amount: number; // In cents
  seasonedYear: number; // Year when 5-year rule satisfied
  status: 'seasoned' | 'pending' | 'future';
  yearsRemaining: number;
}

/**
 * Extract conversion cohorts from yearly results
 * 5-year rule: Conversion is penalty-free 5 years after January 1 of conversion year
 */
function extractCohorts(
  years: YearlyResult[],
  currentYear: number
): ConversionCohort[] {
  const cohorts: ConversionCohort[] = [];

  for (const year of years) {
    if (year.conversionAmount > 0) {
      // 5-year rule starts January 1 of conversion year
      const seasonedYear = year.year + 5;
      const yearsRemaining = Math.max(0, seasonedYear - currentYear);

      let status: ConversionCohort['status'] = 'seasoned';
      if (year.year > currentYear) {
        status = 'future';
      } else if (seasonedYear > currentYear) {
        status = 'pending';
      }

      cohorts.push({
        conversionYear: year.year,
        amount: year.conversionAmount,
        seasonedYear,
        status,
        yearsRemaining,
      });
    }
  }

  return cohorts;
}

interface RothSeasoningTrackerProps {
  formulaYears: YearlyResult[];
  currentYear: number;
  clientAge: number;
}

/**
 * RothSeasoningTracker - Displays 5-year Roth seasoning status for conversions
 *
 * The 5-year rule requires Roth conversions to "season" for 5 tax years before
 * the converted principal can be withdrawn penalty-free (if under age 59.5).
 *
 * Addresses competitive improvement #10 from requirements.
 */
export function RothSeasoningTracker({
  formulaYears,
  currentYear,
  clientAge,
}: RothSeasoningTrackerProps) {
  const cohorts = extractCohorts(formulaYears, currentYear);

  // Age 59.5+ exempts from 10% early withdrawal penalty on converted principal
  const isOver59Half = clientAge >= 60; // Simplified: use age 60

  // Calculate totals by status
  const totals = cohorts.reduce(
    (acc, cohort) => {
      acc[cohort.status] += cohort.amount;
      return acc;
    },
    { seasoned: 0, pending: 0, future: 0 }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>5-Year Roth Seasoning Tracker</span>
          {isOver59Half && (
            <Badge variant="default" className="bg-green-600 text-white">
              Age 59 1/2+ (No penalty)
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isOver59Half && (
          <p className="text-sm text-muted-foreground">
            Since you are over age 59 1/2, the 10% early withdrawal penalty does not apply
            to Roth conversions regardless of the 5-year rule. The tracking below shows
            when each conversion cohort becomes fully seasoned.
          </p>
        )}

        {cohorts.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No conversions in formula scenario
          </p>
        ) : (
          <>
            {/* Cohort list */}
            <div className="space-y-2">
              {cohorts.map((cohort) => (
                <div
                  key={cohort.conversionYear}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    cohort.status === 'seasoned' && 'bg-green-50 dark:bg-green-950/20',
                    cohort.status === 'pending' && 'bg-yellow-50 dark:bg-yellow-950/20',
                    cohort.status === 'future' && 'bg-muted/50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    {cohort.status === 'seasoned' && (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                    {cohort.status === 'pending' && (
                      <Clock className="h-5 w-5 text-yellow-600" />
                    )}
                    {cohort.status === 'future' && (
                      <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    )}

                    {/* Year and amount */}
                    <div>
                      <span className="font-medium">{cohort.conversionYear}</span>
                      <span className="text-muted-foreground ml-2">
                        {formatCurrency(cohort.amount)}
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  {cohort.status === 'seasoned' && (
                    <Badge variant="default" className="bg-green-600 text-white">
                      Penalty-Free
                    </Badge>
                  )}
                  {cohort.status === 'pending' && (
                    <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400">
                      {cohort.yearsRemaining} year{cohort.yearsRemaining !== 1 ? 's' : ''} left
                    </Badge>
                  )}
                  {cohort.status === 'future' && (
                    <Badge variant="secondary">Planned</Badge>
                  )}
                </div>
              ))}
            </div>

            {/* Summary totals */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Seasoned
                </p>
                <p className="font-mono font-medium text-green-600">
                  {formatCurrency(totals.seasoned)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Pending
                </p>
                <p className="font-mono font-medium text-yellow-600">
                  {formatCurrency(totals.pending)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Planned
                </p>
                <p className="font-mono font-medium text-muted-foreground">
                  {formatCurrency(totals.future)}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
