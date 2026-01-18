# Phase 08: Advanced Features - Research

**Researched:** 2026-01-18
**Domain:** Financial Planning Analytics (Breakeven, Widow's Penalty, ACA, Sensitivity, Audit Logging)
**Confidence:** MEDIUM (domain-specific calculations verified, some approximations required)

## Summary

This phase implements five advanced features for the Roth conversion optimizer: breakeven visualization, widow's penalty analysis, enhanced ACA calculations, sensitivity analysis, and audit logging. Each feature has been researched for implementation patterns and calculation methodologies.

The breakeven visualization extends the existing simple crossover detection with proper visualization using Recharts (already in use). The widow's penalty analysis requires running a secondary simulation with modified filing status and income parameters. ACA subsidy calculations need enhancement from simple cliff detection to actual dollar impact using the applicable percentage table. Sensitivity analysis should use scenario-based approaches rather than Monte Carlo (simpler, deterministic, more appropriate for this use case). Audit logging leverages PostgreSQL/Supabase with an append-only pattern.

**Primary recommendation:** Implement features as pure calculation modules first, then add visualization components. Use the existing simulation architecture (baseline/blueprint pattern) to avoid architecture changes.

## Standard Stack

The project already has the correct stack in place. No new dependencies needed.

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.x | Framework | Already in use |
| TypeScript | Strict | Type safety | Already configured |
| Recharts | Latest | Visualization | Already used for wealth-chart |
| Supabase | Latest | Database/Auth | Already configured |

### Supporting (No New Dependencies)
| Capability | Implementation | Rationale |
|------------|----------------|-----------|
| Breakeven visualization | Recharts `LineChart` + `ReferenceLine` + `ReferenceArea` | Already using this pattern in `wealth-chart.tsx` |
| Widow's penalty | Pure TypeScript calculation module | Extends existing scenario pattern |
| ACA calculations | Pure TypeScript with lookup tables | Same pattern as existing `aca.ts` module |
| Sensitivity analysis | Pure TypeScript iteration | No statistical libraries needed |
| Audit logging | PostgreSQL + Supabase trigger | Native database capability |

### Alternatives Considered
| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| Monte Carlo for sensitivity | @risk, mathjs | Overkill - scenario-based is sufficient for this use case |
| External audit service | Audit trail SaaS | Unnecessary - PostgreSQL append-only tables meet requirements |
| D3.js for visualization | Recharts | Already using Recharts, no need to change |

## Architecture Patterns

### Recommended Module Structure
```
lib/calculations/
├── modules/
│   ├── aca.ts                 # Enhance existing ACA module
│   └── widow-penalty.ts       # NEW: Single-filer scenario runner
├── analysis/
│   ├── breakeven.ts           # NEW: Enhanced breakeven with multiple metrics
│   ├── sensitivity.ts         # NEW: Scenario-based sensitivity runner
│   └── types.ts               # Types for analysis results
├── scenarios/
│   ├── baseline.ts            # Existing
│   ├── blueprint.ts           # Existing
│   └── widow.ts               # NEW: Post-spouse-death scenario
└── engine.ts                  # Update to support analysis options

lib/data/
├── aca-percentages.ts         # NEW: Applicable percentage table by year
└── federal-brackets.ts        # Existing (used for widow bracket shift)

supabase/migrations/
└── XXX_audit_log.sql          # NEW: Audit log schema

components/results/
├── breakeven-chart.tsx        # NEW: Enhanced breakeven visualization
├── widow-analysis.tsx         # NEW: Before/after bracket comparison
├── sensitivity-chart.tsx      # NEW: Fan chart or scenario comparison
└── audit-panel.tsx            # NEW: Calculation history display
```

### Pattern 1: Scenario Extension for Widow's Penalty

The existing baseline/blueprint pattern should be extended to support a third "widow" scenario that runs post-spouse-death calculations.

**What:** Run existing simulation with modified filing status (single) and income (survivor benefits only)
**When to use:** When `client.widow_analysis === true` and filing status is married
**Example:**
```typescript
// Source: Derived from existing blueprint.ts pattern
interface WidowScenarioInput {
  client: Client;
  startYear: number;      // Year after assumed spouse death
  projectionYears: number;
  deathYear: number;      // When spouse passes (usually 10-15 years out)
}

function runWidowScenario(input: WidowScenarioInput): YearlyResult[] {
  // Clone client with widow modifications
  const widowClient: Client = {
    ...input.client,
    filing_status: 'single',
    ss_spouse: 0,  // Lost spouse SS
    // ss_self might increase if taking survivor benefit
  };

  // Run with single-filer brackets and reduced deduction
  return runBlueprintScenario(widowClient, input.startYear, input.projectionYears);
}
```

### Pattern 2: Scenario-Based Sensitivity Analysis

Use deterministic scenario variations rather than Monte Carlo simulation.

**What:** Run simulation multiple times with different growth/tax rate assumptions
**When to use:** When `client.sensitivity === true`
**Example:**
```typescript
// Source: Financial planning best practices
interface SensitivityScenario {
  name: string;
  growthRate: number;
  taxRateMultiplier: number;  // 1.0 = current law, 1.2 = +20%
}

const SENSITIVITY_SCENARIOS: SensitivityScenario[] = [
  { name: 'Base Case', growthRate: 6, taxRateMultiplier: 1.0 },
  { name: 'Low Growth', growthRate: 4, taxRateMultiplier: 1.0 },
  { name: 'High Growth', growthRate: 8, taxRateMultiplier: 1.0 },
  { name: 'Higher Taxes', growthRate: 6, taxRateMultiplier: 1.2 },
  { name: 'Lower Taxes', growthRate: 6, taxRateMultiplier: 0.8 },
  { name: 'Pessimistic', growthRate: 4, taxRateMultiplier: 1.2 },
  { name: 'Optimistic', growthRate: 8, taxRateMultiplier: 0.8 },
];

function runSensitivityAnalysis(client: Client): Record<string, SimulationResult> {
  return SENSITIVITY_SCENARIOS.reduce((acc, scenario) => {
    const modifiedClient = {
      ...client,
      growth_rate: scenario.growthRate,
      // Apply tax multiplier through custom override
    };
    acc[scenario.name] = runSimulation(createSimulationInput(modifiedClient));
    return acc;
  }, {} as Record<string, SimulationResult>);
}
```

### Pattern 3: Enhanced ACA Subsidy Calculation

Replace the existing rough estimate with actual subsidy calculation using the applicable percentage table.

**What:** Calculate precise subsidy impact using FPL percentage and benchmark premium
**When to use:** Pre-Medicare clients (age < 65) with `client.include_aca === true`
**Example:**
```typescript
// Source: IRS Rev. Proc. 2024-35, Healthcare.gov methodology
interface ACACalculationInput {
  magi: number;           // In cents
  householdSize: number;
  state: string;
  age: number;
  conversionAmount: number;
}

interface ACADetailedResult {
  fplPercent: number;
  applicablePercent: number;
  expectedContribution: number;  // What they should pay
  benchmarkPremium: number;      // SLCSP estimate
  subsidyAmount: number;         // Benchmark - contribution
  conversionImpact: number;      // Change in subsidy due to conversion
  crossesCliff: boolean;         // Above 400% FPL
}

// Applicable percentage table (2025 enhanced / 2026 post-enhancement)
const APPLICABLE_PERCENTAGES_2025 = [
  { minFPL: 0, maxFPL: 150, minPct: 0, maxPct: 0 },
  { minFPL: 150, maxFPL: 200, minPct: 0, maxPct: 2 },
  { minFPL: 200, maxFPL: 250, minPct: 2, maxPct: 4 },
  { minFPL: 250, maxFPL: 300, minPct: 4, maxPct: 6 },
  { minFPL: 300, maxFPL: 400, minPct: 6, maxPct: 8.5 },
  { minFPL: 400, maxFPL: Infinity, minPct: 8.5, maxPct: 8.5 },
];

const APPLICABLE_PERCENTAGES_2026 = [
  { minFPL: 100, maxFPL: 133, minPct: 2.10, maxPct: 2.10 },
  { minFPL: 133, maxFPL: 150, minPct: 3.14, maxPct: 4.19 },
  { minFPL: 150, maxFPL: 200, minPct: 4.19, maxPct: 6.52 },
  { minFPL: 200, maxFPL: 250, minPct: 6.52, maxPct: 8.33 },
  { minFPL: 250, maxFPL: 300, minPct: 8.33, maxPct: 9.83 },
  { minFPL: 300, maxFPL: 400, minPct: 9.83, maxPct: 9.83 },
  { minFPL: 400, maxFPL: Infinity, minPct: null, maxPct: null }, // No subsidy
];

function getApplicablePercentage(fplPercent: number, year: number): number {
  const table = year <= 2025 ? APPLICABLE_PERCENTAGES_2025 : APPLICABLE_PERCENTAGES_2026;
  const bracket = table.find(b => fplPercent >= b.minFPL && fplPercent < b.maxFPL);

  if (!bracket || bracket.minPct === null) return 0; // Above cliff

  // Linear interpolation within bracket
  const range = bracket.maxFPL - bracket.minFPL;
  const position = (fplPercent - bracket.minFPL) / range;
  return bracket.minPct + position * (bracket.maxPct - bracket.minPct);
}
```

### Pattern 4: PostgreSQL Audit Log with Supabase

Implement append-only audit logging using PostgreSQL triggers.

**What:** Record all calculation runs with inputs and results
**When to use:** Every time `runSimulation` is called
**Example:**
```sql
-- Source: Supabase blog "Postgres Auditing in 150 lines of SQL"
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.calculation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID NOT NULL REFERENCES clients(id),

  -- Calculation inputs (snapshot)
  input_hash TEXT NOT NULL,        -- SHA256 of inputs for deduplication
  client_snapshot JSONB NOT NULL,  -- Full client data at time of calculation

  -- Calculation outputs (summary)
  strategy TEXT NOT NULL,
  break_even_age INTEGER,
  total_tax_savings BIGINT,
  baseline_final_wealth BIGINT,
  blueprint_final_wealth BIGINT,

  -- Metadata
  engine_version TEXT NOT NULL DEFAULT '1.0.0',
  calculation_ms INTEGER           -- Performance tracking
);

-- Prevent updates and deletes (immutability)
CREATE OR REPLACE FUNCTION audit.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_update
  BEFORE UPDATE OR DELETE ON audit.calculation_log
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_modification();

-- RLS: Users can only see their own audit logs
ALTER TABLE audit.calculation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own logs"
  ON audit.calculation_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own logs"
  ON audit.calculation_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for efficient queries
CREATE INDEX idx_audit_client_created
  ON audit.calculation_log(client_id, created_at DESC);
```

### Anti-Patterns to Avoid

- **Modifying existing SimulationResult type:** Create new analysis-specific types instead of bloating existing types
- **Running widow analysis for every simulation:** Only run when explicitly requested (`widow_analysis === true`)
- **Storing full yearly arrays in audit log:** Store summary metrics only; full data is in `projections` table
- **Using UPDATE on audit table:** Always INSERT new records, never UPDATE

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ACA subsidy cliff detection | Simple > 400% check | Full applicable percentage calculation | Cliff isn't a binary - subsidy tapers, impacts vary by FPL% |
| Tax bracket comparison (widow) | Hardcoded bracket math | Use existing `calculateFederalTax` with different filing status | Already handles all bracket logic |
| Sensitivity visualization | Custom SVG | Recharts `ComposedChart` with multiple `Line` components | Already using Recharts, handles responsive/tooltip |
| Audit log immutability | Application-level checks | PostgreSQL trigger + RLS | Database enforcement is more reliable |
| Input hashing for deduplication | Manual JSON.stringify | `crypto.subtle.digest('SHA-256', ...)` | Native browser API, handles object ordering |

**Key insight:** Most "advanced features" are compositions of existing calculation modules with different inputs, not new calculation types.

## Common Pitfalls

### Pitfall 1: Widow's Penalty Timing Assumption

**What goes wrong:** Assuming spouse death happens at a fixed age (e.g., 80)
**Why it happens:** Simplifying assumption that ignores client-specific situations
**How to avoid:** Let user specify assumed death year OR default to life expectancy table
**Warning signs:** Clients with significant age gaps between spouses get wrong results

### Pitfall 2: ACA Subsidy Cliff vs Taper Confusion

**What goes wrong:** Treating subsidy loss as binary (above/below 400%)
**Why it happens:** The "cliff" terminology is misleading - under enhanced credits (2021-2025) there's no cliff
**How to avoid:**
- For 2025 and earlier: No cliff, 8.5% cap applies to all incomes above 400% FPL
- For 2026+: True cliff returns - above 400% FPL means $0 subsidy
**Warning signs:** Incorrect subsidy calculations for clients near 400% FPL

### Pitfall 3: Sensitivity Analysis Scope Creep

**What goes wrong:** Building full Monte Carlo simulation with probability distributions
**Why it happens:** "Sensitivity analysis" is often conflated with Monte Carlo in finance literature
**How to avoid:** Stick to scenario-based approach - 5-7 predefined scenarios is sufficient
**Warning signs:** Adding npm packages like `mathjs` or `simple-statistics`

### Pitfall 4: Audit Log Performance Impact

**What goes wrong:** Synchronous audit logging slows down calculations
**Why it happens:** Inserting to audit table in the request-response cycle
**How to avoid:**
- Option A: Fire-and-forget INSERT (don't await)
- Option B: Batch inserts after calculation completes
- Option C: Use Supabase Edge Function for async logging
**Warning signs:** Calculation time increases noticeably when audit is enabled

### Pitfall 5: Breakeven Age False Precision

**What goes wrong:** Reporting breakeven to exact age when it depends on assumptions
**Why it happens:** The simple crossover point is treated as definitive
**How to avoid:**
- Show breakeven as a range ("typically 78-82")
- Pair with sensitivity analysis showing how breakeven changes
- Label clearly: "Based on X% growth, Y% inflation"
**Warning signs:** Users treat breakeven age as a guarantee

## Code Examples

Verified patterns from existing codebase and official sources:

### Enhanced Breakeven with Multiple Metrics
```typescript
// Source: Existing engine.ts pattern extended
interface BreakEvenAnalysis {
  simpleBreakEven: number | null;    // First crossover age
  sustainedBreakEven: number | null; // Age when blueprint STAYS ahead
  netBenefit: number;                // Total wealth advantage at end
  crossoverPoints: CrossoverPoint[]; // All crossover events
}

interface CrossoverPoint {
  age: number;
  direction: 'blueprint_ahead' | 'baseline_ahead';
  wealthDifference: number;
}

function analyzeBreakEven(
  baseline: YearlyResult[],
  blueprint: YearlyResult[]
): BreakEvenAnalysis {
  const crossoverPoints: CrossoverPoint[] = [];
  let lastDirection: 'blueprint_ahead' | 'baseline_ahead' | null = null;

  for (let i = 0; i < baseline.length; i++) {
    const diff = blueprint[i].netWorth - baseline[i].netWorth;
    const currentDirection = diff > 0 ? 'blueprint_ahead' : 'baseline_ahead';

    if (lastDirection !== null && currentDirection !== lastDirection) {
      crossoverPoints.push({
        age: blueprint[i].age,
        direction: currentDirection,
        wealthDifference: diff,
      });
    }
    lastDirection = currentDirection;
  }

  return {
    simpleBreakEven: crossoverPoints.find(p => p.direction === 'blueprint_ahead')?.age ?? null,
    sustainedBreakEven: findSustainedBreakEven(crossoverPoints),
    netBenefit: blueprint[blueprint.length - 1].netWorth - baseline[baseline.length - 1].netWorth,
    crossoverPoints,
  };
}
```

### Widow's Penalty Tax Impact Calculation
```typescript
// Source: Based on tax bracket research
function calculateWidowTaxImpact(
  marriedIncome: number,  // MAGI when married filing jointly
  widowIncome: number,    // MAGI as single filer (reduced)
  year: number
): WidowTaxImpact {
  const marriedTax = calculateFederalTax({
    taxableIncome: marriedIncome,
    filingStatus: 'married_filing_jointly',
    taxYear: year,
  });

  const singleTax = calculateFederalTax({
    taxableIncome: widowIncome,
    filingStatus: 'single',
    taxYear: year,
  });

  // Despite LOWER income, tax might be HIGHER
  return {
    marriedTax: marriedTax.totalTax,
    marriedBracket: marriedTax.marginalBracket,
    singleTax: singleTax.totalTax,
    singleBracket: singleTax.marginalBracket,
    taxIncrease: singleTax.totalTax - marriedTax.totalTax,
    bracketJump: singleTax.marginalBracket - marriedTax.marginalBracket,
  };
}
```

### Recharts Multi-Scenario Line Chart
```typescript
// Source: Existing wealth-chart.tsx pattern extended
import { LineChart, Line, XAxis, YAxis, Legend, ResponsiveContainer } from 'recharts';

interface SensitivityChartProps {
  scenarios: Record<string, ChartDataPoint[]>;
}

const SCENARIO_COLORS: Record<string, string> = {
  'Base Case': '#3b82f6',    // blue-500
  'Low Growth': '#f97316',   // orange-500
  'High Growth': '#22c55e',  // green-500
  'Higher Taxes': '#ef4444', // red-500
  'Lower Taxes': '#8b5cf6',  // violet-500
  'Pessimistic': '#6b7280',  // gray-500
  'Optimistic': '#06b6d4',   // cyan-500
};

function SensitivityChart({ scenarios }: SensitivityChartProps) {
  // Merge all scenarios into single dataset keyed by age
  const mergedData = Object.entries(scenarios).reduce((acc, [name, data]) => {
    data.forEach(point => {
      const existing = acc.find(p => p.age === point.age);
      if (existing) {
        existing[name] = point.blueprint;  // Or netWorth
      } else {
        acc.push({ age: point.age, [name]: point.blueprint });
      }
    });
    return acc;
  }, [] as any[]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={mergedData}>
        <XAxis dataKey="age" />
        <YAxis tickFormatter={formatAxisValue} />
        <Legend />
        {Object.keys(scenarios).map(name => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={SCENARIO_COLORS[name] ?? '#6b7280'}
            strokeWidth={name === 'Base Case' ? 3 : 1.5}
            dot={false}
            strokeDasharray={name.includes('Pessimistic') || name.includes('Optimistic') ? '5 5' : undefined}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Audit Log TypeScript Interface
```typescript
// Source: Supabase schema pattern
interface AuditLogEntry {
  id: string;
  created_at: string;
  user_id: string;
  client_id: string;
  input_hash: string;
  client_snapshot: Client;  // Full client at calculation time
  strategy: string;
  break_even_age: number | null;
  total_tax_savings: number;  // cents
  baseline_final_wealth: number;  // cents
  blueprint_final_wealth: number;  // cents
  engine_version: string;
  calculation_ms: number | null;
}

async function logCalculation(
  supabase: SupabaseClient,
  client: Client,
  result: SimulationResult,
  durationMs: number
): Promise<void> {
  const inputHash = await hashObject(client);

  await supabase.from('audit.calculation_log').insert({
    client_id: client.id,
    input_hash: inputHash,
    client_snapshot: client,
    strategy: client.strategy,
    break_even_age: result.breakEvenAge,
    total_tax_savings: result.totalTaxSavings,
    baseline_final_wealth: result.baseline[result.baseline.length - 1].netWorth,
    blueprint_final_wealth: result.blueprint[result.blueprint.length - 1].netWorth,
    engine_version: '1.0.0',
    calculation_ms: durationMs,
  });
}

async function hashObject(obj: object): Promise<string> {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ACA 400% FPL hard cliff | Enhanced credits (no cliff) | ARPA 2021, extended through 2025 | Must support both for 2025 vs 2026+ |
| Single breakeven point | Breakeven range with sensitivity | Industry shift | More honest communication to clients |
| Flat Monte Carlo | Scenario-based sensitivity | Best practice for client-facing tools | Easier to explain, still informative |

**Deprecated/outdated:**
- ACA enhanced credits expire end of 2025 (unless extended by Congress)
- Pre-SECURE Act RMD age (was 70.5, now 73) - already handled in existing code

## Open Questions

Things that couldn't be fully resolved:

1. **Benchmark Premium Estimation**
   - What we know: ACA subsidy = Benchmark Premium - Expected Contribution
   - What's unclear: Benchmark premiums vary by county, age, tobacco use
   - Recommendation: Use national average (~$500-700/month for couple age 60) as configurable default, or allow user override

2. **Widow's Penalty Death Year Assumption**
   - What we know: Need to model single-filer scenario after spouse death
   - What's unclear: When to assume spouse death occurs
   - Recommendation: Default to older spouse's life expectancy from actuarial tables, allow override

3. **Tax Rate Changes for Sensitivity**
   - What we know: TCJA provisions expire after 2025 (rates revert higher)
   - What's unclear: Congressional action possible
   - Recommendation: Include "Higher Taxes" scenario as +20% to all bracket thresholds

## Sources

### Primary (HIGH confidence)
- Existing codebase: `lib/calculations/engine.ts`, `modules/aca.ts`, `scenarios/baseline.ts`
- Existing codebase: `components/results/wealth-chart.tsx` (Recharts pattern)
- Supabase documentation: PostgreSQL audit patterns

### Secondary (MEDIUM confidence)
- [KFF ACA Calculator](https://www.kff.org/interactive/calculator-aca-enhanced-premium-tax-credit/) - Premium tax credit methodology
- [Vanguard BETR Calculator](https://investor.vanguard.com/investor-resources-education/news/a-betr-calculation-for-the-traditional-to-roth-ira-conversion-equation) - Breakeven methodology
- [Financial Planning Association](https://www.financialplanningassociation.org/learning/publications/journal/MAY23-arithmetic-roth-conversions-OPEN) - Roth conversion arithmetic
- [Supabase Blog - Postgres Audit](https://supabase.com/blog/postgres-audit) - Audit log schema pattern
- [Congress.gov CRS R48290](https://www.congress.gov/crs-product/R48290) - Enhanced Premium Tax Credit FAQ

### Tertiary (LOW confidence - needs validation)
- WebSearch results for widow's penalty calculations - cross-referenced with tax bracket data
- ACA applicable percentage exact values for 2026 - may change if enhanced credits extended

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing libraries, no new dependencies
- Architecture patterns: HIGH - Extends existing codebase patterns
- ACA calculations: MEDIUM - Formulas verified, but 2026 rules depend on legislation
- Widow's penalty: MEDIUM - Tax math is straightforward, timing assumptions need user input
- Sensitivity analysis: HIGH - Well-established scenario-based approach
- Audit logging: HIGH - Standard PostgreSQL pattern, Supabase compatible

**Research date:** 2026-01-18
**Valid until:** 2026-02-18 (30 days - review ACA 2026 status before implementation)
