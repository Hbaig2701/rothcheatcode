# Phase 04: Calculation Engine Core - Research

**Researched:** 2026-01-18
**Domain:** Financial Tax Calculations, RMD, Roth Conversion Projections
**Confidence:** HIGH (core tax formulas), MEDIUM (state brackets), HIGH (RMD factors)

## Summary

This phase requires building a client-side calculation engine that projects year-by-year Roth conversion scenarios, comparing "Baseline" (no conversion) against "Blueprint" (strategic conversion) outcomes. The engine must handle federal progressive tax brackets, state taxes for all 50 states, RMD calculations, IRMAA surcharges, NIIT, ACA subsidy cliffs, and widow's penalty analysis.

The core challenge is precision: financial calculations in JavaScript suffer from floating-point errors. The standard approach is using integer cents (already in place in the codebase) combined with a decimal library for intermediate calculations. The engine must run client-side in under 2 seconds for 40-year projections.

**Primary recommendation:** Use pure TypeScript functions with the existing cents-based storage, perform all calculations with integer math where possible, and structure the engine as composable modules (RMD, FederalTax, StateTax, IRMAA, NIIT, ACA, SocialSecurity) that a main Simulation Engine orchestrates year-by-year.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.0 | Type-safe calculation logic | Already in project, enables strict types for financial formulas |
| Native Math | N/A | Core arithmetic | Integer cents avoid floating-point issues for most operations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| decimal.js | ^10.4 | Arbitrary precision decimals | Complex intermediate calculations (growth rates, inflation) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| decimal.js | dinero.js | Dinero is money-specific but adds abstraction; decimal.js is simpler for pure math |
| Client calculation | Server calculation | Server adds latency; client-side meets <2s requirement |
| External tax API | Static reference data | APIs add cost/latency; tax brackets change annually but are predictable |

**Installation:**
```bash
npm install decimal.js
npm install --save-dev @types/decimal.js
```

Note: decimal.js ships with TypeScript types, so the @types package may not be needed.

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── calculations/
│   ├── index.ts              # Main export, engine orchestration
│   ├── types.ts              # All calculation-related types
│   ├── engine.ts             # Year-by-year simulation engine
│   ├── scenarios/
│   │   ├── baseline.ts       # No-conversion scenario
│   │   └── blueprint.ts      # Roth conversion scenario
│   ├── modules/
│   │   ├── rmd.ts            # RMD calculation
│   │   ├── federal-tax.ts    # Progressive federal tax
│   │   ├── state-tax.ts      # State tax (all 50 states)
│   │   ├── social-security.ts # SS benefit taxation
│   │   ├── irmaa.ts          # Medicare surcharge calculation
│   │   ├── niit.ts           # Net Investment Income Tax
│   │   ├── aca.ts            # ACA subsidy cliff analysis
│   │   └── inflation.ts      # Inflation adjustments
│   └── utils/
│       ├── money.ts          # Cents conversion utilities
│       └── age.ts            # Age/year calculations
├── data/
│   ├── federal-brackets.ts   # (existing) Federal tax brackets
│   ├── states.ts             # (existing) State info - needs brackets added
│   ├── rmd-factors.ts        # NEW: Uniform Lifetime Table
│   ├── irmaa-brackets.ts     # NEW: IRMAA thresholds
│   ├── federal-poverty.ts    # NEW: FPL for ACA calculations
│   └── tax-year-2026.ts      # NEW: Year-specific tax data bundle
```

### Pattern 1: Pure Function Calculation Modules
**What:** Each tax/calculation module is a pure function that takes inputs and returns outputs with no side effects.
**When to use:** All calculation logic.
**Example:**
```typescript
// lib/calculations/modules/federal-tax.ts
interface FederalTaxInput {
  taxableIncome: number;      // In cents
  filingStatus: FilingStatus;
  taxYear: number;
}

interface FederalTaxResult {
  totalTax: number;           // In cents
  effectiveRate: number;      // Percentage (e.g., 22.5)
  marginalBracket: number;    // Top bracket rate hit
  bracketBreakdown: BracketAmount[];
}

export function calculateFederalTax(input: FederalTaxInput): FederalTaxResult {
  const brackets = getFederalBrackets(input.taxYear, input.filingStatus);
  let remainingIncome = input.taxableIncome;
  let totalTax = 0;
  const breakdown: BracketAmount[] = [];

  for (const bracket of brackets) {
    const taxableInBracket = Math.min(
      remainingIncome,
      bracket.upperLimit - bracket.lowerLimit
    );
    if (taxableInBracket <= 0) break;

    const taxInBracket = Math.round(taxableInBracket * bracket.rate / 100);
    totalTax += taxInBracket;
    breakdown.push({ rate: bracket.rate, amount: taxInBracket });
    remainingIncome -= taxableInBracket;
  }

  return {
    totalTax,
    effectiveRate: input.taxableIncome > 0
      ? (totalTax / input.taxableIncome) * 100
      : 0,
    marginalBracket: breakdown[breakdown.length - 1]?.rate ?? 0,
    bracketBreakdown: breakdown
  };
}
```

### Pattern 2: Year-by-Year Simulation Engine
**What:** An engine that iterates through projection years, updating account balances and calculating taxes each year.
**When to use:** Main projection calculation.
**Example:**
```typescript
// lib/calculations/engine.ts
interface SimulationInput {
  client: ClientFormData;
  startYear: number;
  endYear: number;
}

interface YearlyResult {
  year: number;
  age: number;
  traditionalBalance: number;
  rothBalance: number;
  taxableBalance: number;
  rmdAmount: number;
  conversionAmount: number;
  totalIncome: number;
  federalTax: number;
  stateTax: number;
  irmaaSurcharge: number;
  niitTax: number;
  netWorth: number;
}

interface SimulationResult {
  baseline: YearlyResult[];
  blueprint: YearlyResult[];
  breakEvenAge: number | null;
  totalTaxSavings: number;
  heirBenefit: number;
}

export function runSimulation(input: SimulationInput): SimulationResult {
  const baseline = runBaselineScenario(input);
  const blueprint = runBlueprintScenario(input);

  return {
    baseline,
    blueprint,
    breakEvenAge: calculateBreakEven(baseline, blueprint),
    totalTaxSavings: calculateTaxSavings(baseline, blueprint),
    heirBenefit: calculateHeirBenefit(baseline, blueprint, input.client.heir_bracket)
  };
}
```

### Pattern 3: Reference Data with Year Indexing
**What:** Store tax brackets and thresholds indexed by year to support projections into the future.
**When to use:** All tax reference data.
**Example:**
```typescript
// lib/data/federal-brackets.ts
interface TaxBracket {
  lowerLimit: number;  // In cents
  upperLimit: number;  // In cents (use Infinity for top bracket)
  rate: number;        // Percentage
}

interface YearlyBrackets {
  single: TaxBracket[];
  married_filing_jointly: TaxBracket[];
  married_filing_separately: TaxBracket[];
  head_of_household: TaxBracket[];
}

// Base year data, inflate for future years
const FEDERAL_BRACKETS_2026: YearlyBrackets = {
  single: [
    { lowerLimit: 0, upperLimit: 1240000, rate: 10 },       // $12,400
    { lowerLimit: 1240000, upperLimit: 5040000, rate: 12 }, // $50,400
    { lowerLimit: 5040000, upperLimit: 10570000, rate: 22 },
    // ... etc
  ],
  // ... other statuses
};

export function getFederalBrackets(year: number, status: FilingStatus): TaxBracket[] {
  // Return base brackets, optionally inflated for future years
  const baseBrackets = FEDERAL_BRACKETS_2026[status];
  if (year === 2026) return baseBrackets;

  // Apply inflation adjustment for future years
  const inflationFactor = Math.pow(1.027, year - 2026); // ~2.7% annual adjustment
  return baseBrackets.map(b => ({
    lowerLimit: Math.round(b.lowerLimit * inflationFactor),
    upperLimit: b.upperLimit === Infinity ? Infinity : Math.round(b.upperLimit * inflationFactor),
    rate: b.rate
  }));
}
```

### Anti-Patterns to Avoid
- **Floating-point for money:** Never use `number` directly for dollar amounts in storage; always use cents (integers)
- **Mutable state in calculations:** Keep all calculation functions pure; don't modify input objects
- **Single monolithic calculate function:** Break into composable modules for testability
- **Hardcoded single tax year:** Always parameterize year for multi-year projections
- **Synchronous blocking on large datasets:** Use chunking if calculations block UI (unlikely with 40 years)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Arbitrary precision math | Custom BigInt wrapper | decimal.js | Handles rounding modes, division properly |
| Tax bracket lookup | Linear search each time | Pre-computed bracket array with binary search | Performance over 40+ years |
| Inflation adjustment | Simple percentage | Compound formula with configurable rate | Accuracy over long projections |
| Date/age calculations | Manual year subtraction | Utility functions with edge cases | Leap years, birthday boundaries |

**Key insight:** Tax calculations have many edge cases (brackets, cliffs, phase-outs). Use lookup tables with proper boundary handling rather than conditionals.

## Common Pitfalls

### Pitfall 1: Floating-Point Accumulation Errors
**What goes wrong:** Small rounding errors compound over 40-year projections, resulting in thousands of dollars of drift.
**Why it happens:** JavaScript's IEEE 754 floats can't represent 0.1 exactly.
**How to avoid:** Store all monetary values in cents as integers. Only convert to dollars for display.
**Warning signs:** Totals don't match sum of parts; penny differences in validation.

### Pitfall 2: IRMAA Cliff Miscalculation
**What goes wrong:** Off-by-one errors cause $80-500/month premium jumps to be missed or applied incorrectly.
**Why it happens:** IRMAA uses cliffs, not gradual increases. $1 over threshold triggers full surcharge.
**How to avoid:** Use strict greater-than comparisons; test boundary values explicitly.
**Warning signs:** Conversion recommendations that put client $1 over IRMAA threshold.

### Pitfall 3: Social Security Taxation "Tax Torpedo"
**What goes wrong:** Model shows $1 of extra income adding $1 of tax, missing the 85% SS taxation multiplier.
**Why it happens:** Each $1 of other income can make $0.85 of SS taxable, creating effective 185% inclusion.
**How to avoid:** Calculate SS taxable amount separately using provisional income formula.
**Warning signs:** Effective tax rates that seem too low in the 50-85% SS taxation zone.

### Pitfall 4: RMD Age Transition (73 vs 75)
**What goes wrong:** Model uses wrong RMD start age based on birth year.
**Why it happens:** SECURE 2.0 changed rules: 73 for 1951-1959, 75 for 1960+.
**How to avoid:** Calculate RMD start age from birth year, not a fixed constant.
**Warning signs:** Projections showing RMDs before client turns 75 when born after 1959.

### Pitfall 5: Widow's Penalty Filing Status Change
**What goes wrong:** Model continues using "married filing jointly" after spouse death in widow analysis.
**Why it happens:** Forgetting that surviving spouse files as single (or qualifying widow for 2 years).
**How to avoid:** Explicitly model filing status transition in widow scenario.
**Warning signs:** Widow analysis showing same tax brackets as joint scenario.

### Pitfall 6: State Tax Not Progressive
**What goes wrong:** Using flat top rate instead of calculating through progressive brackets.
**Why it happens:** Requirements explicitly say to fix this from competitors who use flat override.
**How to avoid:** Store full bracket structure for all 29 progressive states; calculate progressively.
**Warning signs:** California clients paying same effective rate regardless of income level.

## Code Examples

Verified patterns from research:

### RMD Calculation
```typescript
// lib/calculations/modules/rmd.ts
// Source: IRS Publication 590-B, Uniform Lifetime Table

const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
  78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7,
  84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
  96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0,
  102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
  114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
  120: 2.0
};

interface RMDInput {
  age: number;
  traditionalBalance: number;  // In cents, prior year-end
  birthYear: number;
}

interface RMDResult {
  rmdRequired: boolean;
  rmdAmount: number;          // In cents
  distributionPeriod: number;
}

export function calculateRMD(input: RMDInput): RMDResult {
  // Determine RMD start age based on birth year (SECURE 2.0)
  const rmdStartAge = input.birthYear <= 1959 ? 73 : 75;

  if (input.age < rmdStartAge) {
    return { rmdRequired: false, rmdAmount: 0, distributionPeriod: 0 };
  }

  const cappedAge = Math.min(input.age, 120);
  const distributionPeriod = UNIFORM_LIFETIME_TABLE[cappedAge];

  // RMD = Prior year-end balance / Distribution period
  const rmdAmount = Math.round(input.traditionalBalance / distributionPeriod);

  return {
    rmdRequired: true,
    rmdAmount,
    distributionPeriod
  };
}
```

### NIIT Calculation
```typescript
// lib/calculations/modules/niit.ts
// Source: IRS Topic 559

interface NIITInput {
  magi: number;                    // Modified AGI in cents
  netInvestmentIncome: number;     // NII in cents (interest, dividends, capital gains)
  filingStatus: FilingStatus;
}

interface NIITResult {
  applies: boolean;
  taxAmount: number;               // In cents
  thresholdExcess: number;         // How much over threshold
}

const NIIT_THRESHOLDS: Record<FilingStatus, number> = {
  single: 20000000,                    // $200,000
  married_filing_jointly: 25000000,    // $250,000
  married_filing_separately: 12500000, // $125,000
  head_of_household: 20000000          // $200,000
};

const NIIT_RATE = 0.038; // 3.8%

export function calculateNIIT(input: NIITInput): NIITResult {
  const threshold = NIIT_THRESHOLDS[input.filingStatus];

  if (input.magi <= threshold) {
    return { applies: false, taxAmount: 0, thresholdExcess: 0 };
  }

  const thresholdExcess = input.magi - threshold;
  // Tax on lesser of: NII or excess over threshold
  const taxableAmount = Math.min(input.netInvestmentIncome, thresholdExcess);
  const taxAmount = Math.round(taxableAmount * NIIT_RATE);

  return {
    applies: true,
    taxAmount,
    thresholdExcess
  };
}
```

### Social Security Taxation
```typescript
// lib/calculations/modules/social-security.ts
// Source: IRS Publication 915

interface SSTaxInput {
  ssBenefits: number;        // Total SS benefits in cents
  otherIncome: number;       // AGI excluding SS in cents
  taxExemptInterest: number; // Municipal bond interest in cents
  filingStatus: FilingStatus;
}

interface SSTaxResult {
  taxableAmount: number;     // Taxable SS in cents
  taxablePercent: number;    // 0, 50, or 85
  provisionalIncome: number; // For reference
}

export function calculateSSTaxableAmount(input: SSTaxInput): SSTaxResult {
  // Provisional income = AGI + tax-exempt interest + 50% of SS
  const provisionalIncome =
    input.otherIncome +
    input.taxExemptInterest +
    Math.round(input.ssBenefits / 2);

  // Thresholds (not inflation adjusted - frozen since 1984/1993)
  const thresholds = input.filingStatus === 'married_filing_jointly'
    ? { lower: 3200000, upper: 4400000 }  // $32,000 / $44,000
    : { lower: 2500000, upper: 3400000 }; // $25,000 / $34,000

  if (provisionalIncome <= thresholds.lower) {
    return { taxableAmount: 0, taxablePercent: 0, provisionalIncome };
  }

  if (provisionalIncome <= thresholds.upper) {
    // Up to 50% taxable
    const excess = provisionalIncome - thresholds.lower;
    const taxable = Math.min(
      Math.round(excess * 0.5),
      Math.round(input.ssBenefits * 0.5)
    );
    return { taxableAmount: taxable, taxablePercent: 50, provisionalIncome };
  }

  // Up to 85% taxable
  // Complex formula: 85% of excess over upper + lesser of (50% of SS or $4,500/$6,000)
  const baseAmount = input.filingStatus === 'married_filing_jointly' ? 600000 : 450000;
  const fiftyPercentOfSS = Math.round(input.ssBenefits * 0.5);
  const lesserAmount = Math.min(baseAmount, fiftyPercentOfSS);

  const excess85 = provisionalIncome - thresholds.upper;
  const fromExcess = Math.round(excess85 * 0.85);

  const taxable = Math.min(
    fromExcess + lesserAmount,
    Math.round(input.ssBenefits * 0.85)
  );

  return { taxableAmount: taxable, taxablePercent: 85, provisionalIncome };
}
```

### IRMAA Surcharge Calculation
```typescript
// lib/calculations/modules/irmaa.ts
// Source: CMS Medicare 2026 IRMAA brackets

interface IRMAATier {
  singleLower: number;
  singleUpper: number;
  jointLower: number;
  jointUpper: number;
  partBMonthly: number;    // In cents
  partDMonthly: number;    // In cents
}

// 2026 IRMAA brackets (in cents)
const IRMAA_TIERS_2026: IRMAATier[] = [
  { singleLower: 0, singleUpper: 10900000, jointLower: 0, jointUpper: 21800000,
    partBMonthly: 20290, partDMonthly: 0 },  // Standard
  { singleLower: 10900001, singleUpper: 13700000, jointLower: 21800001, jointUpper: 27400000,
    partBMonthly: 28410, partDMonthly: 1450 },
  { singleLower: 13700001, singleUpper: 17100000, jointLower: 27400001, jointUpper: 34200000,
    partBMonthly: 40690, partDMonthly: 3740 },
  { singleLower: 17100001, singleUpper: 20500000, jointLower: 34200001, jointUpper: 41000000,
    partBMonthly: 52890, partDMonthly: 6040 },
  { singleLower: 20500001, singleUpper: 50000000, jointLower: 41000001, jointUpper: 75000000,
    partBMonthly: 64920, partDMonthly: 7820 },
  { singleLower: 50000001, singleUpper: Infinity, jointLower: 75000001, jointUpper: Infinity,
    partBMonthly: 68990, partDMonthly: 9100 }
];

interface IRMAAInput {
  magi: number;              // MAGI from 2 years prior, in cents
  filingStatus: FilingStatus;
  hasPartD: boolean;
}

interface IRMAAResult {
  tier: number;              // 0 = standard, 1-5 = IRMAA tiers
  monthlyPartB: number;      // In cents
  monthlyPartD: number;      // In cents
  annualSurcharge: number;   // Extra cost above standard, in cents
}

export function calculateIRMAA(input: IRMAAInput): IRMAAResult {
  const isJoint = input.filingStatus === 'married_filing_jointly';

  for (let i = IRMAA_TIERS_2026.length - 1; i >= 0; i--) {
    const tier = IRMAA_TIERS_2026[i];
    const lower = isJoint ? tier.jointLower : tier.singleLower;

    if (input.magi >= lower) {
      const standardPartB = IRMAA_TIERS_2026[0].partBMonthly;
      const monthlyPartD = input.hasPartD ? tier.partDMonthly : 0;
      const annualSurcharge = (tier.partBMonthly - standardPartB + monthlyPartD) * 12;

      return {
        tier: i,
        monthlyPartB: tier.partBMonthly,
        monthlyPartD,
        annualSurcharge
      };
    }
  }

  // Should never reach here
  return { tier: 0, monthlyPartB: 20290, monthlyPartD: 0, annualSurcharge: 0 };
}
```

## Reference Data Tables

### 2026 Federal Tax Brackets (in cents)

```typescript
// lib/data/federal-brackets-2026.ts
export const FEDERAL_BRACKETS_2026 = {
  single: [
    { lower: 0, upper: 1240000, rate: 10 },
    { lower: 1240000, upper: 5040000, rate: 12 },
    { lower: 5040000, upper: 10570000, rate: 22 },
    { lower: 10570000, upper: 20177500, rate: 24 },
    { lower: 20177500, upper: 25622500, rate: 32 },
    { lower: 25622500, upper: 64060000, rate: 35 },
    { lower: 64060000, upper: Infinity, rate: 37 }
  ],
  married_filing_jointly: [
    { lower: 0, upper: 2480000, rate: 10 },
    { lower: 2480000, upper: 10080000, rate: 12 },
    { lower: 10080000, upper: 21140000, rate: 22 },
    { lower: 21140000, upper: 40355000, rate: 24 },
    { lower: 40355000, upper: 51245000, rate: 32 },
    { lower: 51245000, upper: 76870000, rate: 35 },
    { lower: 76870000, upper: Infinity, rate: 37 }
  ],
  married_filing_separately: [
    { lower: 0, upper: 1240000, rate: 10 },
    { lower: 1240000, upper: 5040000, rate: 12 },
    { lower: 5040000, upper: 10570000, rate: 22 },
    { lower: 10570000, upper: 20177500, rate: 24 },
    { lower: 20177500, upper: 25622500, rate: 32 },
    { lower: 25622500, upper: 38435000, rate: 35 },
    { lower: 38435000, upper: Infinity, rate: 37 }
  ],
  head_of_household: [
    { lower: 0, upper: 1770000, rate: 10 },
    { lower: 1770000, upper: 6745000, rate: 12 },
    { lower: 6745000, upper: 10570000, rate: 22 },
    { lower: 10570000, upper: 20177500, rate: 24 },
    { lower: 20177500, upper: 25620000, rate: 32 },
    { lower: 25620000, upper: 64060000, rate: 35 },
    { lower: 64060000, upper: Infinity, rate: 37 }
  ]
};
```

### Standard Deductions 2026 (in cents)
```typescript
export const STANDARD_DEDUCTIONS_2026 = {
  single: 1610000,                    // $16,100
  married_filing_jointly: 3220000,    // $32,200
  married_filing_separately: 1610000, // $16,100
  head_of_household: 2415000,         // $24,150
  // Additional for age 65+
  senior_single: 205000,              // $2,050 additional
  senior_married: 165000              // $1,650 additional per spouse
};
```

### ACA Federal Poverty Levels 2026 (for 2026 coverage)
```typescript
// lib/data/federal-poverty.ts
// Source: HHS ASPE Poverty Guidelines (2025 for 2026 coverage)

export const FPL_2025 = {
  contiguous: {
    base: 1564000,      // $15,640 for 1 person
    perPerson: 548000   // $5,480 per additional person
  },
  alaska: {
    base: 1955000,
    perPerson: 685000
  },
  hawaii: {
    base: 1799000,
    perPerson: 630000
  }
};

export function getFPL(householdSize: number, state: string): number {
  const rates = state === 'AK' ? FPL_2025.alaska
              : state === 'HI' ? FPL_2025.hawaii
              : FPL_2025.contiguous;
  return rates.base + (householdSize - 1) * rates.perPerson;
}

export function getACASubsidyCutoff(householdSize: number, state: string): number {
  return getFPL(householdSize, state) * 4; // 400% FPL
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RMD age 72 | RMD age 73/75 | SECURE 2.0 (2023) | Birth year determines start age |
| Enhanced ACA subsidies | 400% FPL cliff returns | 2026 | Major impact on early retirees |
| Standard deduction | Senior bonus deduction | OBBBA (2025) | $6,000 extra for 65+ (phases out) |
| Fixed IRMAA brackets | Annual inflation adjustment | Ongoing | Must update yearly |

**Deprecated/outdated:**
- Pre-2022 Uniform Lifetime Table factors (superseded by current table)
- ACA enhanced subsidies (expired end of 2025)
- Old RMD age of 72 (now 73 or 75 based on birth year)

## Open Questions

Things that couldn't be fully resolved:

1. **State tax bracket accuracy for all 29 progressive states**
   - What we know: Have detailed brackets for CA, NY, NJ, HI, MN, OR, WI, CT, DE, DC
   - What's unclear: Complete bracket data for remaining 19 progressive states
   - Recommendation: Use top marginal rate as fallback; add full brackets incrementally

2. **IRMAA bracket projections beyond 2026**
   - What we know: 2026 brackets are published; ~2.7% annual inflation adjustment
   - What's unclear: Whether future adjustments will maintain this rate
   - Recommendation: Apply 2.7% inflation factor for future years, document as estimate

3. **Tax law stability after OBBBA**
   - What we know: OBBBA made TCJA permanent with some enhancements
   - What's unclear: Whether future legislation will change brackets
   - Recommendation: Build with configurable bracket data; easy to update annually

## Sources

### Primary (HIGH confidence)
- [IRS Publication 590-B](https://www.irs.gov/publications/p590b) - RMD rules and Uniform Lifetime Table
- [Tax Foundation 2026 Federal Brackets](https://taxfoundation.org/data/all/federal/2026-tax-brackets/) - Federal tax brackets
- [IRS Topic 559](https://www.irs.gov/taxtopics/tc559) - Net Investment Income Tax
- [Tax Foundation State Tax Rates](https://taxfoundation.org/data/all/state/state-income-tax-rates/) - State income tax brackets 2025

### Secondary (MEDIUM confidence)
- [Kiplinger IRMAA Brackets 2026](https://www.kiplinger.com/retirement/medicare/medicare-premiums-2026-irmaa-brackets-and-surcharges-for-parts-b-and-d) - Medicare IRMAA thresholds
- [SSA IRMAA Tables](https://secure.ssa.gov/poms.nsf/lnx/0601101020) - Official IRMAA sliding scale
- [Fidelity Roth Conversion Methodology](https://www.fidelity.com/planning/retirement/pdf/roth_conversion_eval_methodology.pdf) - Breakeven analysis approach
- [SmartAsset RMD Table](https://smartasset.com/retirement/rmd-table) - Uniform Lifetime Table verification

### Tertiary (LOW confidence)
- Various financial planning blogs for widow's penalty calculations - concepts verified but specific dollar examples vary
- ACA subsidy cliff information - rules confirmed but premium calculations are marketplace-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - TypeScript with cents-based math is industry standard
- Federal tax calculation: HIGH - IRS publications directly referenced
- RMD factors: HIGH - Official IRS table, unchanged since 2022
- IRMAA brackets: HIGH - SSA/CMS published 2026 data
- State tax brackets: MEDIUM - Top 10 states verified, others need validation
- ACA calculations: MEDIUM - FPL thresholds verified, premium calculations complex
- Widow's penalty: HIGH - Tax bracket differences are mathematical facts

**Research date:** 2026-01-18
**Valid until:** 2027-01-01 (annual tax data refresh required)
