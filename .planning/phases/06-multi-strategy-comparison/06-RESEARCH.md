# Phase 06: Multi-Strategy Comparison - Research

**Researched:** 2026-01-18
**Domain:** Multi-Strategy Financial Comparison, Recommendation UI, TanStack Table Styling
**Confidence:** HIGH

## Summary

This phase extends the calculation engine to run all 4 Roth conversion strategies simultaneously and displays them in a side-by-side comparison table with "BEST" strategy highlighting. The engine from Phase 04 already implements a single strategy via the `client.strategy` field; Phase 06 requires running the blueprint scenario 4 times with each strategy variant and comparing results.

The standard approach is to create a `runMultiStrategySimulation()` function that calls the existing blueprint scenario 4 times with strategy overrides, returning a `MultiStrategyResult` with all 4 outcomes. The comparison table uses TanStack Table (already in the project) with conditional row styling to highlight the "best" strategy based on lifetime wealth (the primary metric), with additional consideration for IRMAA impact and breakeven age.

The "best" strategy determination is algorithmic: highest ending net worth wins, but ties should favor IRMAA-Safe over Aggressive (lower risk), and breakeven age should be displayed for context. A badge component using lucide-react icons (already in project) marks the recommended strategy visually.

**Primary recommendation:** Extend the simulation engine with a multi-strategy wrapper, reuse existing blueprint logic with strategy parameter override, build a responsive comparison table with shadcn/ui Table + TanStack Table, and implement a "Best" badge with star or crown icon from lucide-react.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TanStack Table | ^8.x | Comparison table with sorting | Already in project from Phase 02 |
| shadcn/ui Table | - | Table styling and structure | Already in project |
| lucide-react | (existing) | Icons for "Best" badge (Star, Crown, Trophy) | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwind-merge | (existing) | Conditional class merging | Row highlighting |
| clsx | (existing) | Conditional className building | Badge and row styling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Table | Plain HTML table | Less functionality, but simpler for this fixed-column layout |
| Lucide Star icon | Custom SVG crown | Star is universally understood, already in project |
| Column-based comparison | Row-based (strategies as rows) | Columns show side-by-side better at a glance |

**Installation:**
```bash
# No new dependencies required - all already in project
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── calculations/
│   ├── engine.ts                    # Existing single-strategy engine
│   ├── multi-strategy.ts            # NEW: Multi-strategy wrapper
│   ├── strategy-definitions.ts      # NEW: Strategy target definitions
│   └── types.ts                     # Add MultiStrategyResult type
components/
├── results/
│   ├── strategy-comparison/
│   │   ├── index.ts                 # Barrel export
│   │   ├── strategy-comparison-table.tsx  # Main comparison table
│   │   ├── strategy-column.tsx      # Individual strategy column
│   │   ├── best-badge.tsx           # "BEST" recommendation badge
│   │   └── metric-row.tsx           # Reusable metric row component
│   └── results-summary.tsx          # Updated to include comparison
app/
├── (dashboard)/
│   └── clients/
│       └── [id]/
│           └── results/
│               └── page.tsx         # Updated to run multi-strategy
```

### Pattern 1: Multi-Strategy Simulation Wrapper
**What:** A wrapper function that runs the existing blueprint scenario 4 times with different strategy configurations.
**When to use:** When calculating multi-strategy comparison.
**Example:**
```typescript
// lib/calculations/multi-strategy.ts
import { Client } from '@/lib/types/client';
import { SimulationResult, MultiStrategyResult, StrategyType } from './types';
import { runSimulation } from './engine';

const STRATEGIES: StrategyType[] = ['conservative', 'moderate', 'aggressive', 'irmaa_safe'];

export function runMultiStrategySimulation(
  client: Client,
  startYear: number,
  endYear: number
): MultiStrategyResult {
  const results: Record<StrategyType, SimulationResult> = {} as Record<StrategyType, SimulationResult>;

  for (const strategy of STRATEGIES) {
    // Create a client variant with this strategy
    const clientWithStrategy = {
      ...client,
      strategy
    };

    results[strategy] = runSimulation({
      client: clientWithStrategy,
      startYear,
      endYear
    });
  }

  // Determine best strategy based on ending net worth
  const bestStrategy = determineBestStrategy(results);

  return {
    strategies: results,
    bestStrategy,
    comparisonMetrics: extractComparisonMetrics(results)
  };
}

function determineBestStrategy(
  results: Record<StrategyType, SimulationResult>
): StrategyType {
  let bestStrategy: StrategyType = 'moderate';
  let highestWealth = 0;

  for (const [strategy, result] of Object.entries(results)) {
    const endWealth = result.blueprint[result.blueprint.length - 1].netWorth;
    if (endWealth > highestWealth) {
      highestWealth = endWealth;
      bestStrategy = strategy as StrategyType;
    }
  }

  return bestStrategy;
}
```

### Pattern 2: Strategy Definition Constants
**What:** Centralized strategy configuration extracted from blueprint.ts.
**When to use:** To keep strategy targets DRY and testable.
**Example:**
```typescript
// lib/calculations/strategy-definitions.ts

export interface StrategyDefinition {
  name: string;
  description: string;
  targetBracket: number;       // Fill up to this federal tax bracket
  irmaaAvoidance: boolean;     // Stay below IRMAA Tier 1
  strictIRMAA: boolean;        // Hard cap at IRMAA threshold
  riskLevel: 'low' | 'medium' | 'high';
}

export const STRATEGY_DEFINITIONS: Record<StrategyType, StrategyDefinition> = {
  conservative: {
    name: 'Conservative',
    description: 'Stay within current tax bracket',
    targetBracket: 22,
    irmaaAvoidance: true,
    strictIRMAA: false,
    riskLevel: 'low'
  },
  moderate: {
    name: 'Moderate',
    description: 'Fill up to next bracket',
    targetBracket: 24,
    irmaaAvoidance: true,
    strictIRMAA: false,
    riskLevel: 'medium'
  },
  aggressive: {
    name: 'Aggressive',
    description: 'Fill up to 32% bracket',
    targetBracket: 32,
    irmaaAvoidance: false,
    strictIRMAA: false,
    riskLevel: 'high'
  },
  irmaa_safe: {
    name: 'IRMAA-Safe',
    description: 'Stay below Medicare surcharges',
    targetBracket: 24,
    irmaaAvoidance: true,
    strictIRMAA: true,
    riskLevel: 'low'
  }
};
```

### Pattern 3: Comparison Table with Conditional Row Highlighting
**What:** A table component that highlights the "best" strategy column.
**When to use:** Displaying the 4-strategy comparison.
**Example:**
```typescript
// components/results/strategy-comparison/strategy-comparison-table.tsx
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BestBadge } from './best-badge';
import { MultiStrategyResult, StrategyType } from '@/lib/calculations/types';
import { STRATEGY_DEFINITIONS } from '@/lib/calculations/strategy-definitions';
import { cn } from '@/lib/utils';

interface StrategyComparisonTableProps {
  result: MultiStrategyResult;
  onStrategySelect?: (strategy: StrategyType) => void;
}

const STRATEGIES: StrategyType[] = ['conservative', 'moderate', 'aggressive', 'irmaa_safe'];

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export function StrategyComparisonTable({
  result,
  onStrategySelect
}: StrategyComparisonTableProps) {
  const { strategies, bestStrategy, comparisonMetrics } = result;

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Metric</TableHead>
            {STRATEGIES.map(strategy => (
              <TableHead
                key={strategy}
                className={cn(
                  'text-center',
                  strategy === bestStrategy && 'bg-primary/10'
                )}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="font-semibold">
                    {STRATEGY_DEFINITIONS[strategy].name}
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
                  'text-center font-mono',
                  strategy === bestStrategy && 'bg-primary/10 font-bold'
                )}
              >
                {formatCurrency(comparisonMetrics[strategy].endingWealth)}
              </TableCell>
            ))}
          </TableRow>

          {/* Lifetime Tax Savings Row */}
          <TableRow>
            <TableCell className="font-medium">Lifetime Tax Savings</TableCell>
            {STRATEGIES.map(strategy => (
              <TableCell
                key={strategy}
                className={cn(
                  'text-center font-mono',
                  strategy === bestStrategy && 'bg-primary/10'
                )}
              >
                {formatCurrency(comparisonMetrics[strategy].taxSavings)}
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
                  'text-center',
                  strategy === bestStrategy && 'bg-primary/10'
                )}
              >
                {comparisonMetrics[strategy].breakEvenAge ?? 'N/A'}
              </TableCell>
            ))}
          </TableRow>

          {/* IRMAA Impact Row */}
          <TableRow>
            <TableCell className="font-medium">IRMAA Surcharges</TableCell>
            {STRATEGIES.map(strategy => (
              <TableCell
                key={strategy}
                className={cn(
                  'text-center font-mono',
                  strategy === bestStrategy && 'bg-primary/10'
                )}
              >
                {formatCurrency(comparisonMetrics[strategy].totalIRMAA)}
              </TableCell>
            ))}
          </TableRow>

          {/* Heir Benefit Row */}
          <TableRow>
            <TableCell className="font-medium">Heir Tax Benefit</TableCell>
            {STRATEGIES.map(strategy => (
              <TableCell
                key={strategy}
                className={cn(
                  'text-center font-mono',
                  strategy === bestStrategy && 'bg-primary/10'
                )}
              >
                {formatCurrency(comparisonMetrics[strategy].heirBenefit)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>

      {/* Strategy Selection Row */}
      <div className="grid grid-cols-5 gap-4 p-4 border-t">
        <div className="font-medium text-sm text-muted-foreground">
          Select for Details
        </div>
        {STRATEGIES.map(strategy => (
          <button
            key={strategy}
            onClick={() => onStrategySelect?.(strategy)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              strategy === bestStrategy
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            )}
          >
            View Details
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Pattern 4: Best Strategy Badge Component
**What:** A visual badge indicating the recommended strategy.
**When to use:** In the comparison table header for the best strategy.
**Example:**
```typescript
// components/results/strategy-comparison/best-badge.tsx
import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function BestBadge() {
  return (
    <Badge variant="default" className="gap-1 bg-green-600 text-white">
      <Star className="h-3 w-3 fill-current" />
      <span>BEST</span>
    </Badge>
  );
}
```

### Pattern 5: Strategy Selection State Management
**What:** Client-side state to track which strategy is selected for the detail view.
**When to use:** Connecting comparison table to existing results display.
**Example:**
```typescript
// app/(dashboard)/clients/[id]/results/page.tsx
'use client';

import { useState } from 'react';
import { StrategyComparisonTable } from '@/components/results/strategy-comparison';
import { ResultsSummary } from '@/components/results/results-summary';
import { WealthChart } from '@/components/results/wealth-chart';
import { StrategyType } from '@/lib/calculations/types';

export default function ResultsPage() {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('moderate');

  // ... fetch client and run multi-strategy simulation

  const selectedResult = multiStrategyResult.strategies[selectedStrategy];

  return (
    <div className="space-y-8">
      {/* Strategy Comparison - Always visible */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Strategy Comparison</h2>
        <StrategyComparisonTable
          result={multiStrategyResult}
          onStrategySelect={setSelectedStrategy}
        />
      </section>

      {/* Detail View for Selected Strategy */}
      <section>
        <h2 className="text-xl font-semibold mb-4">
          {STRATEGY_DEFINITIONS[selectedStrategy].name} Strategy Details
        </h2>
        <ResultsSummary results={selectedResult} />
        <WealthChart
          data={transformToChartData(selectedResult)}
          breakEvenAge={selectedResult.breakEvenAge}
        />
      </section>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Recalculating strategies on every render:** Run multi-strategy once, store results
- **Hardcoding strategy parameters in multiple places:** Use STRATEGY_DEFINITIONS constant
- **Ignoring IRMAA in "best" determination:** While wealth is primary, show IRMAA impact prominently
- **Non-responsive comparison table:** Use horizontal scroll or collapse for mobile
- **Missing loading state:** Multi-strategy calc takes longer than single

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Strategy ranking | Custom sorting logic | Simple max() on netWorth | Clear, testable metric |
| Currency formatting | String concatenation | Intl.NumberFormat | Handles edge cases, locales |
| Column highlighting | Complex CSS selectors | Tailwind bg-primary/10 conditional | Consistent with design system |
| Badge styling | Custom styled div | shadcn/ui Badge component | Already in project, accessible |
| Row click handling | Custom event delegation | onClick on button/row | Standard React pattern |

**Key insight:** The comparison is fundamentally a transform of Phase 04's SimulationResult into a comparable format. Keep the calculation logic in lib/, display logic in components/.

## Common Pitfalls

### Pitfall 1: Strategy Calculation Order Dependencies
**What goes wrong:** Running strategies with shared mutable state causes incorrect results.
**Why it happens:** Accidentally mutating the client object instead of spreading.
**How to avoid:** Always create new object with spread: `{ ...client, strategy }`.
**Warning signs:** All strategies return identical results.

### Pitfall 2: "Best" Ties Not Handled
**What goes wrong:** Two strategies have identical ending wealth, no clear winner.
**Why it happens:** Edge cases where strategies converge (very short projection, minimal conversion window).
**How to avoid:** Define tie-breaker order: lower IRMAA > earlier breakeven > lower risk level.
**Warning signs:** First strategy in array always wins on ties.

### Pitfall 3: IRMAA-Safe Showing Worse Results
**What goes wrong:** IRMAA-Safe appears "worst" by wealth but may be best for client.
**Why it happens:** Pure wealth comparison ignores quality-of-life from avoiding Medicare surcharges.
**How to avoid:** Show IRMAA total prominently; add tooltip explaining trade-off.
**Warning signs:** Clients confused why "safe" option shows lower numbers.

### Pitfall 4: Comparison Table Overflow on Mobile
**What goes wrong:** 5-column table (metrics + 4 strategies) doesn't fit mobile viewport.
**Why it happens:** STATE.md says "desktop-first" but table should still be usable on tablet.
**How to avoid:** Use horizontal scroll with sticky first column, or collapse to cards on mobile.
**Warning signs:** Table content cut off or squished on smaller screens.

### Pitfall 5: Selected Strategy Not Persisting
**What goes wrong:** Page reload resets strategy selection to default.
**Why it happens:** useState resets on navigation/refresh.
**How to avoid:** For MVP, default is fine; for enhancement, use URL query param `?strategy=aggressive`.
**Warning signs:** User frustration when switching between pages.

### Pitfall 6: Performance with Large Projections
**What goes wrong:** Running 4 simulations takes > 2 seconds.
**Why it happens:** Each simulation loops 40+ years with complex calculations.
**How to avoid:** Show loading state; consider Web Worker for calculation if blocking.
**Warning signs:** UI freezes during calculation.

## Code Examples

Verified patterns from research and existing project code:

### Types for Multi-Strategy Results
```typescript
// lib/calculations/types.ts - additions

export type StrategyType = 'conservative' | 'moderate' | 'aggressive' | 'irmaa_safe';

export interface StrategyComparisonMetrics {
  endingWealth: number;      // Final year net worth (cents)
  taxSavings: number;        // Lifetime tax savings vs baseline (cents)
  breakEvenAge: number | null;
  totalIRMAA: number;        // Total IRMAA surcharges paid (cents)
  heirBenefit: number;       // Tax benefit to heirs (cents)
  totalConversions: number;  // Sum of all conversions (cents)
}

export interface MultiStrategyResult {
  strategies: Record<StrategyType, SimulationResult>;
  bestStrategy: StrategyType;
  comparisonMetrics: Record<StrategyType, StrategyComparisonMetrics>;
}
```

### Extracting Comparison Metrics
```typescript
// lib/calculations/multi-strategy.ts

function extractComparisonMetrics(
  results: Record<StrategyType, SimulationResult>
): Record<StrategyType, StrategyComparisonMetrics> {
  const metrics: Record<StrategyType, StrategyComparisonMetrics> =
    {} as Record<StrategyType, StrategyComparisonMetrics>;

  for (const [strategy, result] of Object.entries(results)) {
    const lastYear = result.blueprint[result.blueprint.length - 1];

    metrics[strategy as StrategyType] = {
      endingWealth: lastYear.netWorth,
      taxSavings: result.totalTaxSavings,
      breakEvenAge: result.breakEvenAge,
      totalIRMAA: result.blueprint.reduce(
        (sum, year) => sum + year.irmaaSurcharge,
        0
      ),
      heirBenefit: result.heirBenefit,
      totalConversions: result.blueprint.reduce(
        (sum, year) => sum + year.conversionAmount,
        0
      )
    };
  }

  return metrics;
}
```

### Determining Best Strategy with Tie-Breakers
```typescript
// lib/calculations/multi-strategy.ts

const STRATEGY_PRIORITY: StrategyType[] = [
  'irmaa_safe',     // Lowest risk
  'conservative',   // Low risk
  'moderate',       // Medium risk
  'aggressive'      // Highest risk
];

function determineBestStrategy(
  results: Record<StrategyType, SimulationResult>
): StrategyType {
  // Sort strategies by ending wealth (descending)
  const ranked = Object.entries(results)
    .map(([strategy, result]) => ({
      strategy: strategy as StrategyType,
      wealth: result.blueprint[result.blueprint.length - 1].netWorth,
      irmaa: result.blueprint.reduce((s, y) => s + y.irmaaSurcharge, 0)
    }))
    .sort((a, b) => {
      // Primary: highest wealth
      if (b.wealth !== a.wealth) return b.wealth - a.wealth;
      // Tie-breaker 1: lowest IRMAA
      if (a.irmaa !== b.irmaa) return a.irmaa - b.irmaa;
      // Tie-breaker 2: lowest risk (based on priority order)
      return STRATEGY_PRIORITY.indexOf(a.strategy) -
             STRATEGY_PRIORITY.indexOf(b.strategy);
    });

  return ranked[0].strategy;
}
```

### Integration with Results Page
```typescript
// app/(dashboard)/clients/[id]/results/page.tsx

import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { runMultiStrategySimulation } from '@/lib/calculations/multi-strategy';
import { ResultsClient } from './results-client'; // Client component

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

  // Run multi-strategy calculation (server-side)
  const currentYear = new Date().getFullYear();
  const multiStrategyResult = runMultiStrategySimulation(
    client,
    currentYear,
    currentYear + client.projection_years
  );

  return (
    <ResultsClient
      client={client}
      multiStrategyResult={multiStrategyResult}
    />
  );
}
```

### Responsive Table Container
```typescript
// components/results/strategy-comparison/strategy-comparison-table.tsx

// Wrap table in scrollable container for mobile
export function StrategyComparisonTable({ result, onStrategySelect }: Props) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Horizontal scroll on mobile, sticky first column */}
      <div className="overflow-x-auto">
        <Table className="min-w-[600px]">
          {/* ... table content */}
        </Table>
      </div>
    </div>
  );
}
```

## Data Flow

### From Phase 04 Engine to Phase 06 Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 04: Calculation Engine                                    │
│                                                                 │
│  runSimulation(client, startYear, endYear)                      │
│     └── runBaselineScenario()                                   │
│     └── runBlueprintScenario()                                  │
│         └── Uses client.strategy to determine conversion logic  │
│                                                                 │
│  Returns: SimulationResult                                      │
│    - baseline: YearlyResult[]                                   │
│    - blueprint: YearlyResult[]                                  │
│    - breakEvenAge, totalTaxSavings, heirBenefit                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 06: Multi-Strategy Wrapper                                │
│                                                                 │
│  runMultiStrategySimulation(client, startYear, endYear)         │
│     │                                                           │
│     ├── for strategy in [conservative, moderate, aggressive,    │
│     │                    irmaa_safe]:                           │
│     │      result[strategy] = runSimulation(                    │
│     │        { ...client, strategy },                           │
│     │        startYear, endYear                                 │
│     │      )                                                    │
│     │                                                           │
│     ├── bestStrategy = determineBestStrategy(results)           │
│     └── comparisonMetrics = extractComparisonMetrics(results)   │
│                                                                 │
│  Returns: MultiStrategyResult                                   │
│    - strategies: Record<StrategyType, SimulationResult>         │
│    - bestStrategy: StrategyType                                 │
│    - comparisonMetrics: Record<StrategyType, Metrics>           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 06: UI Components                                         │
│                                                                 │
│  StrategyComparisonTable                                        │
│    - Shows 4 columns (one per strategy)                         │
│    - Highlights bestStrategy column with bg-primary/10          │
│    - Shows BestBadge in best column header                      │
│    - Each row = one comparison metric                           │
│    - "View Details" button sets selectedStrategy state          │
│                                                                 │
│  ResultsSummary + WealthChart (from Phase 05)                   │
│    - Receives strategies[selectedStrategy] as input             │
│    - Displays detail view for selected strategy                 │
└─────────────────────────────────────────────────────────────────┘
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single strategy selection | Multi-strategy comparison | User experience expectation | Advisors want to see all options |
| Manual "best" selection | Algorithmic recommendation | Industry standard | Reduces analysis time |
| Text-only comparison | Visual highlighting | UX best practices | Faster comprehension |
| Separate calculation pages | Unified comparison view | Modern fintech design | Single source of truth |

**Deprecated/outdated:**
- Sequential strategy calculation with page reloads
- Advisor manually calculating which is "best"
- Separate reports per strategy (unified comparison is standard)

## Open Questions

Things that couldn't be fully resolved:

1. **Performance threshold for Web Worker**
   - What we know: 4 simulations x 40 years should complete in < 2 seconds on modern hardware
   - What's unclear: Whether low-end devices need optimization
   - Recommendation: Start synchronous; add Web Worker only if performance issues arise

2. **Mobile comparison table layout**
   - What we know: STATE.md says "desktop-first (office use)"
   - What's unclear: Whether tablet users need special consideration
   - Recommendation: Horizontal scroll with sticky metric column; defer card layout

3. **Best strategy weighting preferences**
   - What we know: Ending wealth is primary metric per requirements
   - What's unclear: Whether some clients prefer IRMAA avoidance over max wealth
   - Recommendation: Always show IRMAA prominently; consider user preference in Phase 08

4. **Chart comparison view**
   - What we know: Phase 05 chart shows Baseline vs Blueprint for one strategy
   - What's unclear: Whether to overlay all 4 blueprint lines on one chart
   - Recommendation: Start with single-strategy detail view; multi-line chart as enhancement

## Sources

### Primary (HIGH confidence)
- Existing project code: `lib/types/client.ts`, `lib/validations/client.ts`
- Phase 04 RESEARCH.md and PLANs - strategy definitions and simulation structure
- Phase 05 RESEARCH.md - chart and StatCard patterns
- [shadcn/ui Table](https://ui.shadcn.com/docs/components/table) - Table component patterns
- [TanStack Table Row Selection](https://tanstack.com/table/v8/docs/guide/row-selection) - Row highlighting patterns

### Secondary (MEDIUM confidence)
- [Boldin Roth Conversion Calculator](https://www.boldin.com/retirement/roth-conversion-calculator/) - Multi-strategy comparison grid concept
- [MaxiFi Roth Conversion Optimizer](https://www.maxifi.com/features/roth-conversion-optimizer) - Optimization algorithm concepts
- [Shadcnblocks Compare Blocks](https://www.shadcnblocks.com/blocks/compare) - Comparison table design patterns
- [Fintech Design Guide](https://www.eleken.co/blog-posts/modern-fintech-design-guide) - Financial UI best practices

### Tertiary (LOW confidence)
- [Vanguard BETR Approach](https://investor.vanguard.com/investor-resources-education/news/a-betr-calculation-for-the-traditional-to-roth-ira-conversion-equation) - Breakeven tax rate methodology
- [Contentful TanStack Table Guide](https://www.contentful.com/blog/tanstack-table-react-table/) - Conditional styling patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project from prior phases
- Architecture: HIGH - Extends Phase 04 engine with proven patterns
- Strategy logic: HIGH - Strategy definitions from Phase 04-04-PLAN.md
- UI patterns: MEDIUM - Comparison table patterns verified, specific styling TBD
- "Best" algorithm: HIGH - Simple max() with documented tie-breakers
- Performance: MEDIUM - Needs validation with real data

**Research date:** 2026-01-18
**Valid until:** 2026-04-18 (3 months - stable patterns, depends on Phase 04/05 completion)
