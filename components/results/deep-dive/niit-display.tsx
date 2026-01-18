'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { YearlyResult } from '@/lib/calculations/types';
import { formatCurrency } from '@/lib/calculations/transforms';

/**
 * NIIT thresholds by filing status (in cents)
 * Net Investment Income Tax is 3.8% on excess income above these thresholds
 */
const NIIT_THRESHOLDS: Record<string, number> = {
  single: 20000000,                    // $200,000
  married_filing_jointly: 25000000,    // $250,000
  married_filing_separately: 12500000, // $125,000
  head_of_household: 20000000,         // $200,000
};

interface NIITDisplayProps {
  years: YearlyResult[];
  filingStatus: string;
}

/**
 * NIIT Calculation Display Card
 * Shows MAGI threshold for filing status and years where NIIT applies
 */
export function NIITDisplay({ years, filingStatus }: NIITDisplayProps) {
  const threshold = NIIT_THRESHOLDS[filingStatus] ?? NIIT_THRESHOLDS.single;

  // Find years where NIIT applies
  const niitYears = years.filter((year) => year.niitTax > 0);
  const totalNIIT = years.reduce((sum, year) => sum + year.niitTax, 0);
  const applies = totalNIIT > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Net Investment Income Tax (3.8%)</CardTitle>
            <CardDescription>Medicare surtax on investment income</CardDescription>
          </div>
          <Badge variant={applies ? 'destructive' : 'outline'}>
            {applies ? 'Applies' : 'Below Threshold'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* MAGI Threshold row */}
        <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">MAGI Threshold</span>
          <span className="text-sm font-mono">{formatCurrency(threshold)}</span>
        </div>

        {applies ? (
          <>
            {/* Total NIIT */}
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total NIIT (Lifetime)</span>
              <span className="text-lg font-bold text-red-600">
                {formatCurrency(totalNIIT)}
              </span>
            </div>

            {/* Years with NIIT */}
            <div>
              <p className="text-sm font-medium mb-2">
                Years with NIIT ({niitYears.length} total)
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {niitYears.map((year) => (
                  <div
                    key={year.year}
                    className="flex justify-between items-center text-sm py-1 px-2 hover:bg-muted/50 rounded"
                  >
                    <span>
                      {year.year} (Age {year.age})
                    </span>
                    <span className="font-mono text-red-600">
                      {formatCurrency(year.niitTax)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground">
              MAGI stays below the {formatCurrency(threshold)} threshold
              throughout the projection period.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              No Net Investment Income Tax applies.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          NIIT is 3.8% on the lesser of net investment income or excess MAGI
          above the threshold. Roth conversions can increase MAGI and trigger NIIT.
        </p>
      </CardFooter>
    </Card>
  );
}
