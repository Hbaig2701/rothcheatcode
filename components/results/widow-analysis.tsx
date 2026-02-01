'use client';

import { useMemo } from 'react';
import type { WidowAnalysisResult, WidowTaxImpact } from '@/lib/calculations/analysis/types';

interface WidowAnalysisProps {
  analysis: WidowAnalysisResult;
}

/**
 * Format currency from cents to dollars
 */
function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/**
 * Format bracket percentage
 */
function formatBracket(rate: number): string {
  return `${rate}%`;
}

/**
 * Bracket comparison row component
 */
function BracketRow({ impact, year }: { impact: WidowTaxImpact; year: number }) {
  const isIncrease = impact.taxIncrease > 0;

  return (
    <tr className="border-b">
      <td className="py-2 px-3 text-sm">{year}</td>
      <td className="py-2 px-3 text-sm text-center">
        <span className="font-medium">{formatBracket(impact.marriedBracket)}</span>
        <span className="text-muted-foreground ml-1">
          ({formatCurrency(impact.marriedTax)})
        </span>
      </td>
      <td className="py-2 px-3 text-sm text-center">
        <span className="font-medium">{formatBracket(impact.singleBracket)}</span>
        <span className="text-muted-foreground ml-1">
          ({formatCurrency(impact.singleTax)})
        </span>
      </td>
      <td className="py-2 px-3 text-sm text-center">
        {impact.bracketJump > 0 ? (
          <span className="text-red-600 font-medium">+{impact.bracketJump}%</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className={`py-2 px-3 text-sm text-right font-medium ${
        isIncrease ? 'text-red-600' : 'text-green-600'
      }`}>
        {isIncrease ? '+' : ''}{formatCurrency(impact.taxIncrease)}
      </td>
    </tr>
  );
}

/**
 * Widow's Penalty Analysis Component
 * Shows the tax impact of transitioning from MFJ to Single filing status
 */
export function WidowAnalysis({ analysis }: WidowAnalysisProps) {
  const {
    deathYear,
    taxImpactByYear,
    totalAdditionalTax,
    recommendedConversionIncrease,
    postDeathScenario,
  } = analysis;

  // Calculate average bracket jump
  const avgBracketJump = useMemo(() => {
    if (taxImpactByYear.length === 0) return 0;
    const total = taxImpactByYear.reduce((sum, t) => sum + t.bracketJump, 0);
    return Math.round(total / taxImpactByYear.length);
  }, [taxImpactByYear]);

  // Get first few years for table (limit display)
  const displayYears = taxImpactByYear.slice(0, 10);
  const hasMoreYears = taxImpactByYear.length > 10;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Assumed Death Year</div>
          <div className="text-2xl font-bold">{deathYear}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Avg Bracket Jump</div>
          <div className="text-2xl font-bold text-red-600">
            {avgBracketJump > 0 ? `+${avgBracketJump}%` : '-'}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Additional Tax</div>
          <div className={`text-2xl font-bold ${totalAdditionalTax > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(totalAdditionalTax)}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Suggested Conversion Increase</div>
          <div className="text-2xl font-bold text-[#F5B800]">
            {recommendedConversionIncrease > 0
              ? formatCurrency(recommendedConversionIncrease) + '/yr'
              : 'None'}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
          What is the Widow&apos;s Penalty?
        </h4>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          When a spouse passes, the surviving spouse must file as Single instead of Married Filing Jointly.
          Single tax brackets are significantly narrower - for example, the 22% bracket starts at ~$48K
          for singles vs ~$97K for married couples. This &quot;bracket compression&quot; often results in
          higher taxes despite lower income.
        </p>
      </div>

      {/* Year-by-Year Comparison Table */}
      {taxImpactByYear.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="py-2 px-3 text-left text-sm font-medium">Year</th>
                  <th className="py-2 px-3 text-center text-sm font-medium">
                    Married (MFJ)
                  </th>
                  <th className="py-2 px-3 text-center text-sm font-medium">
                    Single (Widow)
                  </th>
                  <th className="py-2 px-3 text-center text-sm font-medium">
                    Bracket Jump
                  </th>
                  <th className="py-2 px-3 text-right text-sm font-medium">
                    Tax Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayYears.map((impact, idx) => (
                  <BracketRow
                    key={idx}
                    impact={impact}
                    year={deathYear + idx}
                  />
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={4} className="py-2 px-3 text-sm font-medium text-right">
                    {hasMoreYears
                      ? `Total (showing first 10 of ${taxImpactByYear.length} years)`
                      : 'Total'}
                  </td>
                  <td className={`py-2 px-3 text-right font-bold ${
                    totalAdditionalTax > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {totalAdditionalTax > 0 ? '+' : ''}{formatCurrency(totalAdditionalTax)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {recommendedConversionIncrease > 0 && (
        <div className="bg-amber-50 dark:bg-[#F5B800]/10 border border-amber-200 dark:border-[#F5B800]/30 rounded-lg p-4">
          <h4 className="font-medium text-amber-800 dark:text-[#F5B800] mb-2">
            Recommendation
          </h4>
          <p className="text-sm text-amber-700 dark:text-[#F5B800]/80">
            Consider increasing Roth conversions by approximately{' '}
            <strong>{formatCurrency(recommendedConversionIncrease)}</strong> per year
            to fill higher brackets now while filing jointly. This can reduce the
            widow&apos;s penalty impact by lowering future RMDs and taxable income.
          </p>
        </div>
      )}
    </div>
  );
}
