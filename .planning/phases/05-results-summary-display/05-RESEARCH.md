# Phase 05: Results Summary Display - Research

**Researched:** 2026-01-18
**Domain:** React Data Visualization, Financial Charts, Animated Statistics
**Confidence:** HIGH

## Summary

This phase creates the visual presentation layer for Roth conversion projections. It consumes the `SimulationResult` from Phase 04's calculation engine and displays it via summary StatCards with count-up animations and a wealth divergence chart showing Baseline vs Blueprint scenarios over time.

The standard approach uses Recharts (already decided in STATE.md) for the line chart with two series, react-countup for animated number displays in stat cards, and the existing shadcn/ui Card components for layout. The "wow moment" is the wealth divergence visualization where users see their potential gains clearly plotted over time with a breakeven callout.

Key technical considerations: (1) Recharts requires `'use client'` directive since it uses browser APIs, (2) ResponsiveContainer needs a parent with explicit height, (3) currency formatting should use `toLocaleString()` for consistency, (4) count-up animations should trigger on mount with scroll spy disabled for this use case.

**Primary recommendation:** Use Recharts LineChart with ResponsiveContainer inside a fixed-height container, react-countup for StatCard animations, ReferenceLine for breakeven annotation, and custom tooltips for detailed hover information. All chart components must be client components.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^3.6.0 | Line charts, responsive containers | STATE.md decision, 26.5k GitHub stars, excellent TypeScript support (98.4% TS) |
| react-countup | ^6.5.x | Animated number counting | Most popular React counting library, scroll spy support, SSR compatible |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-is | latest | Peer dependency for Recharts | Always install with recharts |
| lucide-react | (existing) | Icons for stat cards (TrendingUp, TrendingDown) | Visual indicators |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-countup | use-count-up | Smaller bundle, but react-countup has better docs and more features |
| react-countup | framer-motion AnimateNumber | Requires Motion+ membership, adds dependency |
| Custom tooltip | Recharts default tooltip | Custom provides better UX for financial data |

**Installation:**
```bash
npm install recharts react-is react-countup
```

## Architecture Patterns

### Recommended Project Structure
```
components/
├── results/
│   ├── index.ts                  # Barrel export
│   ├── results-summary.tsx       # Main container component
│   ├── stat-card.tsx             # Reusable stat card with count-up
│   ├── summary-section.tsx       # Grid of stat cards (Baseline/Blueprint/Difference)
│   ├── wealth-chart.tsx          # Recharts line chart wrapper
│   └── chart-tooltip.tsx         # Custom tooltip component
app/
├── (dashboard)/
│   └── clients/
│       └── [id]/
│           └── results/
│               └── page.tsx      # Results page consuming SimulationResult
```

### Pattern 1: Client Component for Charts
**What:** All Recharts components must be in client components with `'use client'` directive.
**When to use:** Any component rendering Recharts.
**Example:**
```typescript
// components/results/wealth-chart.tsx
'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface WealthChartProps {
  data: ChartDataPoint[];
  breakEvenAge: number | null;
}

export function WealthChart({ data, breakEvenAge }: WealthChartProps) {
  return (
    <div className="h-[400px] w-full"> {/* CRITICAL: Parent needs explicit height */}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="age"
            label={{ value: 'Age', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            tickFormatter={(value) => `$${(value / 100).toLocaleString()}`}
            width={80}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="baseline"
            name="Baseline (No Conversion)"
            stroke="#6b7280"  // gray-500
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="blueprint"
            name="Blueprint (Roth Conversion)"
            stroke="#3b82f6"  // blue-500 (theme color)
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
          />
          {breakEvenAge && (
            <ReferenceLine
              x={breakEvenAge}
              stroke="#22c55e"  // green-500
              strokeDasharray="5 5"
              label={{
                value: `Breakeven: Age ${breakEvenAge}`,
                position: 'top',
                fill: '#22c55e',
                fontSize: 12,
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Pattern 2: StatCard with Count-Up Animation
**What:** Reusable card showing a metric with animated number and trend indicator.
**When to use:** Summary metrics display.
**Example:**
```typescript
// components/results/stat-card.tsx
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
    <Card className={cn('', className)}>
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
```

### Pattern 3: Transform SimulationResult to Chart Data
**What:** Transform the calculation engine output into chart-ready format.
**When to use:** Bridge between Phase 04 output and Phase 05 display.
**Example:**
```typescript
// lib/calculations/transforms.ts

interface ChartDataPoint {
  age: number;
  year: number;
  baseline: number;    // Net worth in cents
  blueprint: number;   // Net worth in cents
}

interface SummaryMetrics {
  baselineEndWealth: number;
  blueprintEndWealth: number;
  difference: number;
  totalTaxSavings: number;
  breakEvenAge: number | null;
  heirBenefit: number;
}

export function transformToChartData(result: SimulationResult): ChartDataPoint[] {
  // Assumes baseline and blueprint arrays have same length and years
  return result.baseline.map((baseYear, index) => ({
    age: baseYear.age,
    year: baseYear.year,
    baseline: baseYear.netWorth,
    blueprint: result.blueprint[index].netWorth,
  }));
}

export function extractSummaryMetrics(result: SimulationResult): SummaryMetrics {
  const lastBaseline = result.baseline[result.baseline.length - 1];
  const lastBlueprint = result.blueprint[result.blueprint.length - 1];

  return {
    baselineEndWealth: lastBaseline.netWorth,
    blueprintEndWealth: lastBlueprint.netWorth,
    difference: lastBlueprint.netWorth - lastBaseline.netWorth,
    totalTaxSavings: result.totalTaxSavings,
    breakEvenAge: result.breakEvenAge,
    heirBenefit: result.heirBenefit,
  };
}
```

### Pattern 4: Custom Tooltip with Formatted Values
**What:** Rich tooltip showing both baseline and blueprint values at a given age.
**When to use:** Chart hover state.
**Example:**
```typescript
// components/results/chart-tooltip.tsx
'use client';

import { type TooltipProps } from 'recharts';
import { type NameType, type ValueType } from 'recharts/types/component/DefaultTooltipContent';

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export function ChartTooltip({
  active,
  payload,
  label
}: TooltipProps<ValueType, NameType>) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const baseline = payload.find(p => p.dataKey === 'baseline');
  const blueprint = payload.find(p => p.dataKey === 'blueprint');
  const difference = blueprint && baseline
    ? (blueprint.value as number) - (baseline.value as number)
    : 0;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-2">Age {label}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Baseline:</span>
          <span className="font-mono">{formatCurrency(baseline?.value as number ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-blue-600">Blueprint:</span>
          <span className="font-mono">{formatCurrency(blueprint?.value as number ?? 0)}</span>
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
```

### Anti-Patterns to Avoid
- **ResponsiveContainer without parent height:** Chart will collapse to 0 height; always wrap in div with explicit height
- **Using `ssr: true` with Recharts:** Will cause hydration errors; use dynamic import with `ssr: false` if needed
- **Animating cents values directly:** Convert to dollars before count-up to avoid showing 100x values
- **Missing 'use client' directive:** Recharts uses browser APIs; forgetting this causes server-side errors
- **Synchronous calculation on render:** Run simulation in useEffect or before render, not during

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Number count-up animation | CSS keyframes + useState | react-countup | Handles easing, formatting, decimal precision |
| Responsive charts | window.resize listener | ResponsiveContainer | Debounced, optimized, handles edge cases |
| Currency formatting | String concatenation | Intl.NumberFormat | Handles locales, negatives, edge cases |
| Chart tooltips | Custom hover state management | Recharts Tooltip with custom content | Positioning, visibility, interaction handled |
| Breakeven indicator | Custom SVG overlay | ReferenceLine | Integrated with chart coordinate system |

**Key insight:** Recharts provides all annotation primitives (ReferenceLine, ReferenceArea, ReferenceDot) that integrate with the chart's coordinate system. Custom SVG overlays are brittle and don't scale with the chart.

## Common Pitfalls

### Pitfall 1: ResponsiveContainer Height Collapse
**What goes wrong:** Chart renders as 0px height, invisible.
**Why it happens:** ResponsiveContainer uses `height="100%"` but parent has no explicit height.
**How to avoid:** Always wrap ResponsiveContainer in a div with explicit height (e.g., `h-[400px]`).
**Warning signs:** Empty chart area, no errors in console.

### Pitfall 2: Hydration Mismatch with Charts
**What goes wrong:** Console error about server/client HTML mismatch.
**Why it happens:** Recharts renders differently on server vs client (uses browser APIs).
**How to avoid:** Use `'use client'` directive; optionally use `dynamic(() => import(...), { ssr: false })`.
**Warning signs:** Flashing content, console hydration errors.

### Pitfall 3: Count-Up with Wrong Scale
**What goes wrong:** Stat card shows $50,000,000 instead of $500,000.
**Why it happens:** Passing cents to CountUp without converting to dollars.
**How to avoid:** Always convert cents to dollars (`value / 100`) before passing to CountUp.
**Warning signs:** Unrealistic large numbers, inconsistent with chart.

### Pitfall 4: Missing react-is Peer Dependency
**What goes wrong:** Runtime error about missing module.
**Why it happens:** Recharts v3 requires react-is as peer dependency.
**How to avoid:** Install both: `npm install recharts react-is`.
**Warning signs:** "Cannot find module 'react-is'" error.

### Pitfall 5: ReferenceLine Label Positioning
**What goes wrong:** Label appears in center of chart, not at reference line.
**Why it happens:** Default label position may not be appropriate for all chart layouts.
**How to avoid:** Explicitly set `label.position` to 'top', 'bottom', 'left', 'right', or 'insideBottomRight'.
**Warning signs:** Label floating in unexpected location.

## Code Examples

Verified patterns from official sources and documentation:

### Complete Results Page Component
```typescript
// app/(dashboard)/clients/[id]/results/page.tsx
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ResultsSummary } from '@/components/results/results-summary';
import { runSimulation } from '@/lib/calculations';

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !client) {
    notFound();
  }

  // Run calculation (could also be done client-side)
  const currentYear = new Date().getFullYear();
  const results = runSimulation({
    client,
    startYear: currentYear,
    endYear: currentYear + client.projection_years,
  });

  return <ResultsSummary results={results} clientName={client.name} />;
}
```

### Summary Section with Three Card Grid
```typescript
// components/results/summary-section.tsx
'use client';

import { StatCard } from './stat-card';
import { type SummaryMetrics } from '@/lib/calculations/transforms';

interface SummarySectionProps {
  metrics: SummaryMetrics;
}

export function SummarySection({ metrics }: SummarySectionProps) {
  const differenceSign = metrics.difference >= 0 ? '+' : '';

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard
        title="Baseline Ending Wealth"
        value={metrics.baselineEndWealth}
        prefix="$"
        className="border-gray-300"
      />
      <StatCard
        title="Blueprint Ending Wealth"
        value={metrics.blueprintEndWealth}
        prefix="$"
        trend="up"
        trendLabel={`${differenceSign}${(metrics.difference / 100).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        })} vs Baseline`}
        className="border-blue-500 border-2"
      />
      <StatCard
        title="Total Lifetime Tax Savings"
        value={metrics.totalTaxSavings}
        prefix="$"
        trend={metrics.totalTaxSavings > 0 ? 'up' : 'neutral'}
        trendLabel={metrics.breakEvenAge
          ? `Breakeven at age ${metrics.breakEvenAge}`
          : 'No breakeven in projection'}
      />
    </div>
  );
}
```

### Recharts YAxis Currency Formatter
```typescript
// Source: Recharts documentation
const currencyFormatter = (value: number) => {
  // Value is in cents, convert to dollars
  const dollars = value / 100;
  if (dollars >= 1000000) {
    return `$${(dollars / 1000000).toFixed(1)}M`;
  }
  if (dollars >= 1000) {
    return `$${(dollars / 1000).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
};

// Usage
<YAxis tickFormatter={currencyFormatter} width={70} />
```

### Line Animation Configuration
```typescript
// For performance and visual appeal
<Line
  type="monotone"
  dataKey="blueprint"
  stroke="#3b82f6"
  strokeWidth={2}
  dot={false}                    // Hide individual data points
  activeDot={{ r: 6 }}           // Show dot only on hover
  isAnimationActive={true}       // Enable entry animation
  animationDuration={1500}       // 1.5 second animation
  animationEasing="ease-out"
/>
```

## Data Structure Expectations

### Input from Phase 04 Calculation Engine

```typescript
// From lib/calculations/types.ts (Phase 04)

interface YearlyResult {
  year: number;
  age: number;
  traditionalBalance: number;  // cents
  rothBalance: number;         // cents
  taxableBalance: number;      // cents
  rmdAmount: number;           // cents
  conversionAmount: number;    // cents
  totalIncome: number;         // cents
  federalTax: number;          // cents
  stateTax: number;            // cents
  irmaaSurcharge: number;      // cents
  niitTax: number;             // cents
  netWorth: number;            // cents (sum of all account balances)
}

interface SimulationResult {
  baseline: YearlyResult[];    // Array for each projected year
  blueprint: YearlyResult[];   // Same structure, different scenario
  breakEvenAge: number | null; // Age where blueprint > baseline, or null
  totalTaxSavings: number;     // cents - lifetime tax savings
  heirBenefit: number;         // cents - benefit to heirs
}
```

### Output for Display Components

```typescript
// For WealthChart
interface ChartDataPoint {
  age: number;
  year: number;
  baseline: number;   // netWorth in cents
  blueprint: number;  // netWorth in cents
}

// For SummarySection
interface SummaryMetrics {
  baselineEndWealth: number;    // Final year netWorth, cents
  blueprintEndWealth: number;   // Final year netWorth, cents
  difference: number;           // blueprint - baseline, cents
  totalTaxSavings: number;      // From SimulationResult, cents
  breakEvenAge: number | null;  // From SimulationResult
  heirBenefit: number;          // From SimulationResult, cents
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts v2 | Recharts v3 | Late 2025 | Better TypeScript, tree-shaking, performance |
| Manual responsive | ResponsiveContainer | Ongoing | No more window listeners |
| Custom animations | react-countup 6.x | 2023+ | ScrollSpy built-in, easier SSR |
| Canvas charts | SVG charts (Recharts) | Preference | Better accessibility, styling with CSS |

**Deprecated/outdated:**
- Recharts v2 patterns (v3 has different TypeScript types)
- `react-visibility-sensor` for scroll triggering (use react-countup's built-in enableScrollSpy)
- Manual chart resizing with window.innerWidth

## Open Questions

Things that couldn't be fully resolved:

1. **Chart performance with 40+ year projections**
   - What we know: Recharts handles hundreds of data points well
   - What's unclear: Exact threshold before performance degrades
   - Recommendation: Test with full 40-year projection; if slow, consider data decimation

2. **Mobile responsiveness priority**
   - What we know: STATE.md says "desktop-first (office use)"
   - What's unclear: Whether charts need mobile optimization
   - Recommendation: Focus on desktop; ensure chart is scrollable on mobile

3. **Print/PDF rendering of charts**
   - What we know: Phase 09 is PDF Export
   - What's unclear: Whether Recharts SVG exports cleanly to PDF
   - Recommendation: Defer to Phase 09; SVG should export well

## Sources

### Primary (HIGH confidence)
- [GitHub - recharts/recharts](https://github.com/recharts/recharts) - v3.6.0, 98.4% TypeScript, official patterns
- [GitHub - glennreyes/react-countup](https://github.com/glennreyes/react-countup) - Official docs for scroll spy, props
- [GitHub - vydimitrov/use-count-up](https://github.com/vydimitrov/use-count-up) - v3.0.1, SSR compatible patterns

### Secondary (MEDIUM confidence)
- [PostHog Recharts Tutorial](https://posthog.com/tutorials/recharts) - Practical usage patterns
- [Medium - Custom Tooltips](https://medium.com/@rutudhokchaule/implementing-custom-tooltips-and-legends-using-recharts-98b6e3c8b712) - TypeScript tooltip patterns
- [dhiwise - ResponsiveContainer Guide](https://www.dhiwise.com/post/simplify-data-visualization-with-recharts-responsivecontainer) - Height requirements

### Tertiary (LOW confidence)
- [shadcnstore.com Widgets](https://shadcnstore.com/blocks/application/widgets) - StatCard design patterns (not official shadcn)
- [Various GitHub issues](https://github.com/recharts/recharts/issues) - Edge cases and workarounds

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Recharts is STATE.md decision, react-countup is well-documented
- Architecture: HIGH - Patterns verified against official docs
- Data transformation: HIGH - Based on Phase 04 RESEARCH.md types
- Pitfalls: HIGH - Common issues well-documented in GitHub issues

**Research date:** 2026-01-18
**Valid until:** 2026-07-18 (6 months - stable libraries)
