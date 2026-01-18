# Phase 07: Deep Dive Views - Research

**Researched:** 2026-01-18
**Domain:** Year-by-Year Tables, Tabbed Interfaces, IRMAA Visualization, Roth Seasoning Tracker
**Confidence:** HIGH

## Summary

This phase creates the detailed analysis views for Roth conversion projections, including year-by-year data tables, a tabbed interface for navigating different views, IRMAA bar chart visualization with threshold lines, 5-year Roth seasoning tracker, and NIIT calculation display.

The codebase already has comprehensive data structures in place from Phase 04: `YearlyResult` contains 17 fields per year including all account balances, income components, taxes, and net worth. The `Projection` type stores `baseline_years` and `blueprint_years` as arrays of `YearlyResult`. Recharts is installed (v3.6.0) and react-countup is available for animations.

The key challenge is presenting dense financial data in an accessible way. The tabbed interface organizes information logically (Summary, Baseline, Blueprint, Schedule), sticky table headers enable scrolling through 40+ years of data while maintaining context, and IRMAA visualization uses a bar chart with horizontal reference lines at each tier threshold.

**Primary recommendation:** Install shadcn/ui Tabs component, create reusable YearByYearTable with sticky thead styling, use Recharts BarChart with multiple ReferenceLine components for IRMAA visualization, and implement Roth seasoning tracker as a separate card showing conversion cohorts and their status.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui Tabs | - | Tabbed navigation | Part of shadcn/ui, accessible, URL-syncable |
| Recharts | ^3.6.0 | IRMAA bar chart | Already installed, ReferenceLine for thresholds |
| shadcn/ui Table | - | Year-by-year data | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-countup | ^6.5.3 | Animated totals | Already installed from Phase 05 |
| lucide-react | ^0.562.0 | Icons for status indicators | Already installed |
| tailwind-merge | ^3.4.0 | Conditional styling | Already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui Tabs | Ariakit Tabs | shadcn already in project, same Radix base |
| CSS sticky | react-sticky-table | CSS is simpler, no extra dependency |
| ReferenceLine | ReferenceArea | Lines clearer for showing cliff boundaries |

**Installation:**
```bash
npx shadcn@latest add tabs
```

## Architecture Patterns

### Recommended Project Structure
```
components/
├── results/
│   ├── deep-dive/
│   │   ├── index.ts                    # Barrel export
│   │   ├── deep-dive-tabs.tsx          # Main tabbed container
│   │   ├── year-by-year-table.tsx      # Reusable table with sticky header
│   │   ├── baseline-detail.tsx         # Baseline scenario tab content
│   │   ├── blueprint-detail.tsx        # Blueprint scenario tab content
│   │   ├── schedule-tab.tsx            # Conversion schedule view
│   │   ├── irmaa-chart.tsx             # IRMAA bar chart with thresholds
│   │   ├── roth-seasoning-tracker.tsx  # 5-year rule tracker
│   │   └── niit-display.tsx            # NIIT calculation breakdown
app/
├── (dashboard)/
│   └── clients/
│       └── [id]/
│           └── results/
│               └── page.tsx            # Updated to include deep dive tabs
```

### Pattern 1: URL-Synced Tabs with useSearchParams
**What:** Tab state persisted in URL query parameter for shareability and back-button support.
**When to use:** Main tabbed navigation where users might want to link to specific tabs.
**Example:**
```typescript
// components/results/deep-dive/deep-dive-tabs.tsx
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCallback } from 'react';

type TabValue = 'summary' | 'baseline' | 'blueprint' | 'schedule';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'blueprint', label: 'Blueprint' },
  { value: 'schedule', label: 'Schedule' },
];

interface DeepDiveTabsProps {
  projection: Projection;
  children?: React.ReactNode;
}

export function DeepDiveTabs({ projection }: DeepDiveTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read current tab from URL, default to 'summary'
  const currentTab = (searchParams.get('tab') as TabValue) || 'summary';

  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        {TABS.map(tab => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="summary">
        {/* Summary content with overview stats */}
      </TabsContent>
      <TabsContent value="baseline">
        <YearByYearTable years={projection.baseline_years} scenario="baseline" />
      </TabsContent>
      <TabsContent value="blueprint">
        <YearByYearTable years={projection.blueprint_years} scenario="blueprint" />
      </TabsContent>
      <TabsContent value="schedule">
        <ConversionSchedule projection={projection} />
      </TabsContent>
    </Tabs>
  );
}
```

### Pattern 2: Year-by-Year Table with Sticky Header
**What:** Table displaying yearly data with header that stays visible while scrolling.
**When to use:** Displaying baseline or blueprint year-by-year projections.
**Example:**
```typescript
// components/results/deep-dive/year-by-year-table.tsx
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { YearlyResult } from '@/lib/calculations';
import { formatCurrency } from '@/lib/calculations/transforms';

interface YearByYearTableProps {
  years: YearlyResult[];
  scenario: 'baseline' | 'blueprint';
}

// Column definitions for the table
const COLUMNS = [
  { key: 'year', label: 'Year', className: 'w-16' },
  { key: 'age', label: 'Age', className: 'w-14' },
  { key: 'traditionalBalance', label: 'Traditional IRA', format: 'currency' },
  { key: 'rothBalance', label: 'Roth IRA', format: 'currency' },
  { key: 'taxableBalance', label: 'Taxable', format: 'currency' },
  { key: 'rmdAmount', label: 'RMD', format: 'currency' },
  { key: 'conversionAmount', label: 'Conversion', format: 'currency' },
  { key: 'totalIncome', label: 'Total Income', format: 'currency' },
  { key: 'federalTax', label: 'Federal Tax', format: 'currency' },
  { key: 'stateTax', label: 'State Tax', format: 'currency' },
  { key: 'irmaaSurcharge', label: 'IRMAA', format: 'currency' },
  { key: 'netWorth', label: 'Net Worth', format: 'currency', highlight: true },
];

export function YearByYearTable({ years, scenario }: YearByYearTableProps) {
  return (
    <div className="rounded-md border">
      {/* Scrollable container with fixed height */}
      <div className="max-h-[600px] overflow-auto">
        <Table>
          {/* Sticky header - uses CSS position: sticky */}
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {COLUMNS.map(col => (
                <TableHead
                  key={col.key}
                  className={cn(
                    'bg-muted/50 font-semibold',
                    col.className,
                    col.highlight && 'bg-primary/10'
                  )}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.map((year, index) => (
              <TableRow
                key={year.year}
                className={cn(
                  index % 2 === 0 && 'bg-muted/20',
                  // Highlight conversion years
                  scenario === 'blueprint' && year.conversionAmount > 0 && 'bg-blue-50/50'
                )}
              >
                {COLUMNS.map(col => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'font-mono text-sm',
                      col.highlight && 'font-semibold'
                    )}
                  >
                    {col.format === 'currency'
                      ? formatCurrency(year[col.key as keyof YearlyResult] as number)
                      : year[col.key as keyof YearlyResult]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

### Pattern 3: IRMAA Bar Chart with Threshold Lines
**What:** Bar chart showing MAGI by year with horizontal reference lines at IRMAA tier thresholds.
**When to use:** Visualizing income relative to IRMAA brackets over projection period.
**Example:**
```typescript
// components/results/deep-dive/irmaa-chart.tsx
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { YearlyResult } from '@/lib/calculations';
import { IRMAA_TIERS_2026 } from '@/lib/data/irmaa-brackets';
import { formatAxisValue } from '@/lib/calculations/transforms';

interface IRMAAChartProps {
  years: YearlyResult[];
  filingStatus: 'single' | 'married_filing_jointly';
}

// Get IRMAA thresholds for the filing status
function getIRMAAThresholds(isJoint: boolean) {
  return IRMAA_TIERS_2026.slice(0, -1).map((tier, index) => ({
    value: isJoint ? tier.jointUpper : tier.singleUpper,
    label: `Tier ${index + 1}`,
    color: ['#22c55e', '#eab308', '#f97316', '#ef4444', '#991b1b'][index],
  }));
}

export function IRMAAChart({ years, filingStatus }: IRMAAChartProps) {
  const isJoint = filingStatus === 'married_filing_jointly';
  const thresholds = getIRMAAThresholds(isJoint);

  // Transform data for chart
  const chartData = years.map(year => ({
    age: year.age,
    year: year.year,
    magi: year.totalIncome, // MAGI approximation
  }));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-lg font-semibold mb-4">IRMAA Income Thresholds</h3>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="age"
              label={{ value: 'Age', position: 'insideBottom', offset: -10 }}
            />
            <YAxis
              tickFormatter={formatAxisValue}
              width={80}
              label={{ value: 'MAGI', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(age) => `Age ${age}`}
            />
            <Legend />

            {/* IRMAA tier threshold lines */}
            {thresholds.map((threshold, index) => (
              <ReferenceLine
                key={index}
                y={threshold.value}
                stroke={threshold.color}
                strokeDasharray="5 5"
                label={{
                  value: threshold.label,
                  position: 'right',
                  fill: threshold.color,
                  fontSize: 11,
                }}
              />
            ))}

            <Bar
              dataKey="magi"
              name="Modified AGI"
              fill="#3b82f6"
              opacity={0.8}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend explaining thresholds */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {thresholds.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            <span>
              {t.label}: {formatCurrency(t.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Pattern 4: 5-Year Roth Seasoning Tracker
**What:** Visual tracker showing which Roth conversions have completed the 5-year holding period.
**When to use:** Showing penalty-free withdrawal eligibility by conversion year.
**Example:**
```typescript
// components/results/deep-dive/roth-seasoning-tracker.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { YearlyResult } from '@/lib/calculations';
import { formatCurrency } from '@/lib/calculations/transforms';
import { cn } from '@/lib/utils';

interface ConversionCohort {
  conversionYear: number;
  amount: number;
  seasonedYear: number;  // Year when 5-year rule is satisfied
  status: 'seasoned' | 'pending' | 'future';
  yearsRemaining: number;
}

interface RothSeasoningTrackerProps {
  blueprintYears: YearlyResult[];
  currentYear: number;
  clientAge: number;
}

// Extract conversion cohorts from blueprint data
function extractCohorts(
  years: YearlyResult[],
  currentYear: number
): ConversionCohort[] {
  const cohorts: ConversionCohort[] = [];

  for (const year of years) {
    if (year.conversionAmount > 0) {
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

export function RothSeasoningTracker({
  blueprintYears,
  currentYear,
  clientAge,
}: RothSeasoningTrackerProps) {
  const cohorts = extractCohorts(blueprintYears, currentYear);
  const clientOver59Half = clientAge >= 60; // Simplified; actual would check exact 59.5

  if (cohorts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">5-Year Roth Seasoning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No conversions in blueprint scenario.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          5-Year Roth Seasoning Tracker
          {clientOver59Half && (
            <Badge variant="outline" className="text-green-600 border-green-600">
              Age 59 1/2+ (No penalty)
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {clientOver59Half && (
          <p className="text-sm text-muted-foreground mb-4">
            Since you are over 59 1/2, converted amounts can be withdrawn penalty-free
            regardless of the 5-year rule. Earnings still require the 5-year rule.
          </p>
        )}

        <div className="space-y-3">
          {cohorts.map((cohort) => (
            <div
              key={cohort.conversionYear}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border',
                cohort.status === 'seasoned' && 'bg-green-50 border-green-200',
                cohort.status === 'pending' && 'bg-yellow-50 border-yellow-200',
                cohort.status === 'future' && 'bg-muted/50'
              )}
            >
              <div className="flex items-center gap-3">
                {cohort.status === 'seasoned' && (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
                {cohort.status === 'pending' && (
                  <Clock className="h-5 w-5 text-yellow-600" />
                )}
                {cohort.status === 'future' && (
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">
                    {cohort.conversionYear} Conversion
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(cohort.amount)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {cohort.status === 'seasoned' && (
                  <Badge className="bg-green-600">Penalty-Free</Badge>
                )}
                {cohort.status === 'pending' && (
                  <div>
                    <Badge variant="outline" className="text-yellow-700 border-yellow-600">
                      {cohort.yearsRemaining} years left
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Seasoned: {cohort.seasonedYear}
                    </p>
                  </div>
                )}
                {cohort.status === 'future' && (
                  <Badge variant="secondary">Planned</Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  cohorts
                    .filter((c) => c.status === 'seasoned')
                    .reduce((sum, c) => sum + c.amount, 0)
                )}
              </p>
              <p className="text-xs text-muted-foreground">Seasoned</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">
                {formatCurrency(
                  cohorts
                    .filter((c) => c.status === 'pending')
                    .reduce((sum, c) => sum + c.amount, 0)
                )}
              </p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-muted-foreground">
                {formatCurrency(
                  cohorts
                    .filter((c) => c.status === 'future')
                    .reduce((sum, c) => sum + c.amount, 0)
                )}
              </p>
              <p className="text-xs text-muted-foreground">Planned</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Pattern 5: NIIT Display Component
**What:** Card showing Net Investment Income Tax calculation and impact.
**When to use:** Displaying NIIT breakdown in the deep dive views.
**Example:**
```typescript
// components/results/deep-dive/niit-display.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { YearlyResult } from '@/lib/calculations';
import { formatCurrency } from '@/lib/calculations/transforms';

interface NIITDisplayProps {
  years: YearlyResult[];
  filingStatus: string;
}

const NIIT_THRESHOLDS: Record<string, number> = {
  single: 20000000,                    // $200,000
  married_filing_jointly: 25000000,    // $250,000
  married_filing_separately: 12500000, // $125,000
  head_of_household: 20000000,         // $200,000
};

export function NIITDisplay({ years, filingStatus }: NIITDisplayProps) {
  const threshold = NIIT_THRESHOLDS[filingStatus] || 20000000;

  // Find years where NIIT applies
  const niitYears = years.filter(y => y.niitTax > 0);
  const totalNIIT = years.reduce((sum, y) => sum + y.niitTax, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Net Investment Income Tax (3.8%)
          {totalNIIT > 0 ? (
            <Badge variant="destructive">Applies</Badge>
          ) : (
            <Badge variant="outline" className="text-green-600 border-green-600">
              Below Threshold
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <span className="text-muted-foreground">MAGI Threshold</span>
            <span className="font-mono font-semibold">{formatCurrency(threshold)}</span>
          </div>

          {totalNIIT > 0 ? (
            <>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span className="text-red-700">Total NIIT (All Years)</span>
                <span className="font-mono font-semibold text-red-700">
                  {formatCurrency(totalNIIT)}
                </span>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Years with NIIT ({niitYears.length}):
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {niitYears.map(y => (
                    <div
                      key={y.year}
                      className="flex justify-between text-sm py-1 px-2 bg-muted/30 rounded"
                    >
                      <span>{y.year} (Age {y.age})</span>
                      <span className="font-mono">{formatCurrency(y.niitTax)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Net Investment Income Tax applies in this projection.
              Your MAGI stays below the {formatCurrency(threshold)} threshold.
            </p>
          )}

          <p className="text-xs text-muted-foreground border-t pt-3">
            NIIT is 3.8% on the lesser of net investment income or excess MAGI
            above the threshold. Roth conversions can increase MAGI and trigger NIIT.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Anti-Patterns to Avoid
- **Table without max-height:** Will push page layout with 40+ rows; always constrain with scrollable container
- **Forgetting sticky header z-index:** Without z-index, table body rows scroll over header
- **Recalculating cohorts on every render:** Extract and memoize conversion cohort data
- **Hard-coded IRMAA thresholds in chart:** Import from shared data file for consistency
- **Not handling empty years array:** Always check for data presence before rendering

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab URL sync | Manual pushState | useSearchParams + router | Handles history, SSR properly |
| Sticky header | IntersectionObserver | CSS position: sticky on th | Native, performant, simpler |
| Threshold lines | Custom SVG overlay | Recharts ReferenceLine | Integrated with chart coordinate system |
| Currency formatting | Template strings | formatCurrency from transforms | Consistent, handles edge cases |
| Status icons | Emoji or custom SVG | Lucide CheckCircle/Clock | Accessible, consistent sizing |

**Key insight:** The existing codebase already has `formatCurrency` and `formatAxisValue` in `lib/calculations/transforms.ts`. Reuse these everywhere for consistency.

## Common Pitfalls

### Pitfall 1: Sticky Header Not Working
**What goes wrong:** Table header scrolls with content instead of staying fixed.
**Why it happens:** CSS `position: sticky` fails if any parent has `overflow: hidden` or if parent doesn't have explicit height.
**How to avoid:** Ensure the scrollable container has `overflow: auto` or `overflow-y: auto`, not `overflow: hidden`. Apply sticky to `<th>` elements, not `<thead>`.
**Warning signs:** Header disappears when scrolling; no sticky behavior at all.

### Pitfall 2: URL Tab State Lost on Navigation
**What goes wrong:** Clicking back button doesn't restore previous tab.
**Why it happens:** Using `useState` instead of URL searchParams for tab state.
**How to avoid:** Use `useSearchParams` to read tab state, `router.push` to update.
**Warning signs:** Tab resets to default on page reload or back button.

### Pitfall 3: IRMAA Thresholds Out of Date
**What goes wrong:** Chart shows wrong threshold lines vs actual calculation.
**Why it happens:** Hard-coded values in chart component don't match `irmaa-brackets.ts`.
**How to avoid:** Import `IRMAA_TIERS_2026` from shared data file.
**Warning signs:** Visual threshold doesn't match where bars change color.

### Pitfall 4: 5-Year Rule Confusion
**What goes wrong:** Tracker shows wrong status or confuses users about penalties.
**Why it happens:** The 5-year rule is complex: (1) conversion principal 5-year rule (10% penalty), (2) account 5-year rule (for earnings). Age 59.5 affects the first but not the second.
**How to avoid:** Clearly distinguish which rule is being tracked; add explanatory text.
**Warning signs:** Users think all Roth money is penalty-free after 5 years regardless of age.

### Pitfall 5: Performance with Many Years
**What goes wrong:** Page becomes sluggish with 40-year projections.
**Why it happens:** Re-rendering large tables without optimization.
**How to avoid:** Use React.memo on table rows; consider virtualization for extreme cases (50+ years).
**Warning signs:** Noticeable lag when switching tabs or scrolling.

### Pitfall 6: Mobile Table Overflow
**What goes wrong:** Year-by-year table extends beyond viewport, no horizontal scroll.
**Why it happens:** Fixed column widths exceed mobile viewport.
**How to avoid:** The existing shadcn/ui Table component wraps in `overflow-x-auto` container. Verify it's not overridden.
**Warning signs:** Table content cut off on mobile devices.

## Code Examples

Verified patterns from official sources and existing codebase:

### Installing shadcn/ui Tabs
```bash
# Source: https://ui.shadcn.com/docs/components/tabs
npx shadcn@latest add tabs
```

This adds:
- `components/ui/tabs.tsx` with Tabs, TabsList, TabsTrigger, TabsContent

### CSS for Sticky Table Header
```css
/* Applied via Tailwind classes in component */
.sticky-table thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: hsl(var(--muted) / 0.5);
}
```

Tailwind equivalent:
```typescript
<TableHeader className="sticky top-0 z-10">
  <TableRow>
    <TableHead className="bg-muted/50">...</TableHead>
  </TableRow>
</TableHeader>
```

### Recharts ReferenceLine Configuration
```typescript
// Source: https://recharts.github.io/en-US/api/ReferenceLine/
<ReferenceLine
  y={thresholdValue}           // Horizontal line at this Y value
  stroke="#ef4444"             // Line color
  strokeDasharray="5 5"        // Dashed line
  strokeWidth={1}
  label={{
    value: "Tier 2",
    position: 'right',         // Label position: 'left', 'right', 'top', 'bottom'
    fill: '#ef4444',           // Label text color
    fontSize: 11,
  }}
/>
```

### Data Transformation for Table Columns
```typescript
// Already exists in lib/calculations/types.ts - YearlyResult interface
// Use this type for table column definitions

interface YearlyResult {
  year: number;
  age: number;
  spouseAge: number | null;
  traditionalBalance: number;   // Display these
  rothBalance: number;
  taxableBalance: number;
  rmdAmount: number;
  conversionAmount: number;
  ssIncome: number;
  pensionIncome: number;
  otherIncome: number;
  totalIncome: number;
  federalTax: number;
  stateTax: number;
  niitTax: number;
  irmaaSurcharge: number;
  totalTax: number;
  taxableSS: number;
  netWorth: number;
}
```

### 5-Year Rule Implementation Logic
```typescript
// Source: IRS Publication 590-B, verified via Fidelity and Schwab
// https://www.fidelity.com/learning-center/personal-finance/retirement/roth-ira-5-year-rule

function getConversionStatus(
  conversionYear: number,
  currentYear: number,
  clientAge: number
): 'seasoned' | 'pending' | 'penalty-risk' {
  const yearsHeld = currentYear - conversionYear;

  // Age 59.5+ overrides the conversion 5-year rule for penalty purposes
  if (clientAge >= 60) {
    return 'seasoned'; // No 10% penalty regardless of holding period
  }

  // Under 59.5: must wait 5 years to avoid 10% penalty on converted principal
  if (yearsHeld >= 5) {
    return 'seasoned';
  }

  return 'pending';
}
```

## Data Structures

### Existing Data Available

From `lib/types/projection.ts`:
```typescript
interface Projection {
  // ... metadata fields
  baseline_years: YearlyResult[];
  blueprint_years: YearlyResult[];
  break_even_age: number | null;
  total_tax_savings: number;
  // ... summary fields
}
```

From `lib/calculations/types.ts`:
```typescript
interface YearlyResult {
  year: number;
  age: number;
  spouseAge: number | null;
  traditionalBalance: number;
  rothBalance: number;
  taxableBalance: number;
  rmdAmount: number;
  conversionAmount: number;        // Key for seasoning tracker
  ssIncome: number;
  pensionIncome: number;
  otherIncome: number;
  totalIncome: number;             // Key for IRMAA chart
  federalTax: number;
  stateTax: number;
  niitTax: number;                 // Key for NIIT display
  irmaaSurcharge: number;          // Key for IRMAA impact
  totalTax: number;
  taxableSS: number;
  netWorth: number;
}
```

### New Derived Types for Phase 07

```typescript
// For year-by-year table column configuration
interface TableColumn {
  key: keyof YearlyResult;
  label: string;
  format: 'currency' | 'number' | 'none';
  className?: string;
  highlight?: boolean;
}

// For Roth seasoning tracker
interface ConversionCohort {
  conversionYear: number;
  amount: number;
  seasonedYear: number;
  status: 'seasoned' | 'pending' | 'future';
  yearsRemaining: number;
}

// For IRMAA chart threshold data
interface IRMAAThreshold {
  value: number;        // In cents
  label: string;        // e.g., "Tier 1"
  color: string;        // Hex color
  partBPremium: number; // Monthly Part B in cents
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JavaScript sticky polyfill | CSS position: sticky | 2020+ | Native support in all modern browsers |
| react-tabs library | Radix UI Tabs (shadcn) | 2023+ | Better accessibility, composition |
| Hash-based tab routing | searchParams-based | Next.js App Router | Server component compatible |
| Victory/Chart.js | Recharts v3 | 2025 | Better TypeScript, tree-shaking |

**Deprecated/outdated:**
- `react-sticky` or `react-sticky-header` libraries (CSS sticky is sufficient)
- Hash fragments for tab state (`#tab=baseline`) - use searchParams instead
- Manual scroll position tracking for sticky (CSS handles this)

## 2026 IRMAA Thresholds (Updated)

From CMS Medicare announcements and verified sources:

| Filing Status | Tier 0 (Standard) | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|--------------|-------------------|--------|--------|--------|--------|--------|
| Single | Up to $109,000 | $109,001-$136,000 | $136,001-$170,000 | $170,001-$205,000 | $205,001-$500,000 | >$500,000 |
| MFJ | Up to $218,000 | $218,001-$272,000 | $272,001-$340,000 | $340,001-$410,000 | $410,001-$750,000 | >$750,000 |

**Part B Monthly Premiums 2026:**
- Tier 0: $202.90 (standard)
- Tier 1: $284.10 (+$81.20)
- Tier 2: $406.30 (+$203.40)
- Tier 3: $528.50 (+$325.60)
- Tier 4: $650.60 (+$447.70)
- Tier 5: $689.90 (+$487.00)

Note: The existing `lib/data/irmaa-brackets.ts` has slightly different values. Verify and update if needed during implementation.

## Open Questions

Things that couldn't be fully resolved:

1. **Column selection for year-by-year table**
   - What we know: YearlyResult has 17 fields; not all need display
   - What's unclear: Which columns are most important to users
   - Recommendation: Start with core set (year, age, balances, conversions, taxes, netWorth); add column toggle in future

2. **Multi-strategy deep dive**
   - What we know: Phase 06 shows comparison; Phase 07 shows single-strategy detail
   - What's unclear: Should deep dive tabs show selected strategy or all strategies
   - Recommendation: Show currently selected strategy's detail; strategy selector at top

3. **Print/PDF rendering**
   - What we know: Phase 09 handles PDF export
   - What's unclear: How charts and sticky tables render in print
   - Recommendation: Defer to Phase 09; ensure components don't break in print media

4. **IRMAA chart Y-axis scale**
   - What we know: Income varies widely across clients
   - What's unclear: Whether to auto-scale or fix scale to show all thresholds
   - Recommendation: Auto-scale with minimum showing Tier 2; let high earners see full picture

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Tabs](https://ui.shadcn.com/docs/components/tabs) - Official tabs component documentation
- [Recharts ReferenceLine API](https://recharts.github.io/en-US/api/ReferenceLine/) - Official API documentation
- [IRS Publication 590-B](https://www.irs.gov/publications/p590b) - Roth IRA distribution rules, 5-year rule
- Existing codebase: `/Users/aymanbaig/Desktop/Rothc/rothc/lib/calculations/types.ts` - YearlyResult structure
- Existing codebase: `/Users/aymanbaig/Desktop/Rothc/rothc/lib/data/irmaa-brackets.ts` - IRMAA tier data

### Secondary (MEDIUM confidence)
- [Medicare Premiums 2026 - Kiplinger](https://www.kiplinger.com/retirement/medicare/medicare-premiums-2026-irmaa-brackets-and-surcharges-for-parts-b-and-d) - 2026 IRMAA thresholds
- [Fidelity 5-Year Rule Guide](https://www.fidelity.com/learning-center/personal-finance/retirement/roth-ira-5-year-rule) - Roth seasoning explanation
- [Charles Schwab 5-Year Rule](https://www.schwab.com/learn/story/what-to-know-about-five-year-rule-roths) - Penalty clarification
- [DEV Community - Radix Tabs URL](https://dev.to/yinks/how-to-make-radix-ui-tabs-url-based-in-nextjs-2nfn) - URL state pattern
- [CSS Sticky Header Blog](https://muhimasri.com/blogs/react-sticky-header-column/) - Sticky implementation patterns

### Tertiary (LOW confidence)
- [thefinancebuff.com 2026 IRMAA](https://thefinancebuff.com/medicare-irmaa-income-brackets.html) - Projected brackets
- Various CSS-Tricks articles on sticky positioning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project or easily addable via shadcn
- Architecture: HIGH - Extends existing patterns from Phase 05/06
- Year-by-year table: HIGH - Standard pattern, shadcn Table already works
- IRMAA visualization: HIGH - Recharts ReferenceLine well-documented
- Roth seasoning tracker: MEDIUM - Logic verified, UI design needs validation
- URL tab sync: HIGH - Standard Next.js pattern with useSearchParams
- NIIT display: HIGH - Data exists in YearlyResult, display straightforward

**Research date:** 2026-01-18
**Valid until:** 2026-07-18 (6 months - stable libraries, IRMAA data annual)
