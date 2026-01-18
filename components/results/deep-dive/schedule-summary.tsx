'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { YearlyResult } from '@/lib/calculations/types';
import { formatCurrency } from '@/lib/calculations/transforms';

interface ScheduleSummaryProps {
  blueprintYears: YearlyResult[];
}

/**
 * ScheduleSummary - High-level summary of the conversion schedule
 *
 * Shows total conversions, conversion period, number of years,
 * average per year, and a detailed breakdown by year.
 */
export function ScheduleSummary({ blueprintYears }: ScheduleSummaryProps) {
  // Extract years with conversions
  const conversionYears = blueprintYears.filter((year) => year.conversionAmount > 0);

  // Calculate summary metrics
  const totalConversions = conversionYears.reduce(
    (sum, year) => sum + year.conversionAmount,
    0
  );
  const conversionCount = conversionYears.length;
  const firstConversionYear =
    conversionYears.length > 0 ? conversionYears[0].year : null;
  const lastConversionYear =
    conversionYears.length > 0 ? conversionYears[conversionYears.length - 1].year : null;
  const averageConversion =
    conversionCount > 0 ? Math.round(totalConversions / conversionCount) : 0;

  // Format conversion period string
  const conversionPeriod =
    firstConversionYear && lastConversionYear
      ? firstConversionYear === lastConversionYear
        ? `${firstConversionYear}`
        : `${firstConversionYear} - ${lastConversionYear}`
      : '-';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversion Schedule Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {conversionCount === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No conversions scheduled in this strategy
          </p>
        ) : (
          <>
            {/* Summary grid */}
            <div className="space-y-1">
              <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">Total Conversions</span>
                <span className="font-mono font-medium">
                  {formatCurrency(totalConversions)}
                </span>
              </div>
              <div className="flex justify-between py-2 px-3">
                <span className="text-muted-foreground">Conversion Period</span>
                <span className="font-medium">{conversionPeriod}</span>
              </div>
              <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">Number of Years</span>
                <span className="font-medium">{conversionCount}</span>
              </div>
              <div className="flex justify-between py-2 px-3">
                <span className="text-muted-foreground">Average per Year</span>
                <span className="font-mono font-medium">
                  {formatCurrency(averageConversion)}
                </span>
              </div>
            </div>

            {/* Detailed year-by-year breakdown */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Year-by-Year Breakdown
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {conversionYears.map((year) => (
                  <div
                    key={year.year}
                    className="flex justify-between py-1.5 px-2 text-sm hover:bg-muted/30 rounded"
                  >
                    <span>{year.year}</span>
                    <span className="font-mono">
                      {formatCurrency(year.conversionAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
