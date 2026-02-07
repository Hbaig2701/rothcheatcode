import type { YearlyResult } from './types';
import type { Client } from '@/lib/types/client';
import type { Projection } from '@/lib/types/projection';

// Story entry types
export type StoryTrigger =
  | 'conversion_start'
  | 'conversion_year'
  | 'conversion_end'
  | 'social_security_start'
  | 'spouse_ss_start'
  | 'rmd_age'
  | 'break_even'
  | 'roth_exceeds_original'
  | 'halfway_converted'
  | 'fully_converted'
  | 'decade_snapshot'
  | 'projection_end'
  | 'death_legacy';

export type StoryIcon = 'start' | 'progress' | 'milestone' | 'warning' | 'celebration' | 'end';
export type StorySentiment = 'positive' | 'neutral' | 'caution';

export interface StoryMetric {
  label: string;
  value: string;
}

export interface RunningTotals {
  totalConverted: string;
  totalTaxPaid: string;
  rothBalance: string;
  iraBalance: string;
}

export interface StoryEntry {
  year: number;
  age: number;
  trigger: StoryTrigger;
  headline: string;
  body: string;
  metrics?: StoryMetric[];
  comparison?: string;
  runningTotals: RunningTotals;
  icon: StoryIcon;
  sentiment: StorySentiment;
}

// Currency formatter
const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

/**
 * Generate story entries from projection data
 */
export function generateStory(
  client: Client,
  projection: Projection
): StoryEntry[] {
  const storyEntries: StoryEntry[] = [];
  const years = projection.blueprint_years;
  const baselineYears = projection.baseline_years;

  // Tracking variables
  let totalConverted = 0;
  let totalTaxPaid = 0;
  let hasHitBreakEven = false;
  let hasExceededOriginal = false;
  let hasHitHalfway = false;
  let hasFullyConverted = false;
  let conversionYearCount = 0;
  let ssStarted = false;
  let spouseSsStarted = false;

  // Calculate totals upfront
  const totalConversionYears = years.filter(y => y.conversionAmount > 0).length;
  const originalIRA = client.qualified_account_value ?? 0;
  const bonusAmount = Math.round(originalIRA * (client.bonus_percent ?? 0) / 100);
  const startingWithBonus = originalIRA + bonusAmount;
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;
  const targetBracket = client.max_tax_rate ?? 24;

  // SS ages
  const primarySsStartAge = client.ssi_payout_age ?? 67;
  const spouseSsStartAge = client.spouse_ssi_payout_age ?? 67;
  const primarySsAmount = client.ssi_annual_amount ?? 0;
  const spouseSsAmount = client.spouse_ssi_annual_amount ?? 0;

  years.forEach((year, index) => {
    const prevYear = index > 0 ? years[index - 1] : null;
    const baselineYear = baselineYears[index];
    const taxPaidThisYear = year.federalTax + year.stateTax;

    // CONVERSION START
    if (year.conversionAmount > 0 && totalConverted === 0) {
      conversionYearCount = 1;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'conversion_start',
        headline: 'Your Roth Conversion Begins',
        body: `This year, we begin moving money from your Traditional IRA to a Roth IRA. We convert ${formatCurrency(year.conversionAmount)} and pay ${formatCurrency(taxPaidThisYear)} in taxes at the ${targetBracket}% bracket. This is strategic — by paying tax now at a lower rate, we avoid higher taxes later.`,
        metrics: [
          { label: 'Converted', value: formatCurrency(year.conversionAmount) },
          { label: 'Tax Paid', value: formatCurrency(taxPaidThisYear) },
          { label: 'Tax Bracket', value: `${targetBracket}%` },
        ],
        comparison: `Without this strategy, this money would be taxed at ${heirTaxRate * 100}%+ when your heirs inherit, or when RMDs force withdrawals at age 73.`,
        runningTotals: {
          totalConverted: formatCurrency(year.conversionAmount),
          totalTaxPaid: formatCurrency(taxPaidThisYear),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'start',
        sentiment: 'positive',
      });
      totalConverted += year.conversionAmount;
      totalTaxPaid += taxPaidThisYear;
    }
    // CONVERSION END (last conversion year)
    else if (year.conversionAmount > 0 && conversionYearCount === totalConversionYears - 1) {
      conversionYearCount++;
      totalConverted += year.conversionAmount;
      totalTaxPaid += taxPaidThisYear;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'conversion_end',
        headline: 'Conversions Complete',
        body: `Your final conversion of ${formatCurrency(year.conversionAmount)} is complete. Over ${totalConversionYears} years, you converted ${formatCurrency(totalConverted)} to Roth, paying ${formatCurrency(totalTaxPaid)} in taxes. Your retirement savings are now positioned for tax-free growth.`,
        metrics: [
          { label: 'Total Converted', value: formatCurrency(totalConverted) },
          { label: 'Total Tax Paid', value: formatCurrency(totalTaxPaid) },
          { label: 'Roth Balance', value: formatCurrency(year.rothBalance) },
        ],
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'celebration',
        sentiment: 'positive',
      });
    }
    // CONVERSION YEAR (middle years) - only show for longer conversion periods
    else if (year.conversionAmount > 0 && conversionYearCount > 0 && conversionYearCount < totalConversionYears - 1) {
      conversionYearCount++;
      totalConverted += year.conversionAmount;
      totalTaxPaid += taxPaidThisYear;

      // Only add story entries for every other year if many conversions, to avoid clutter
      if (totalConversionYears <= 5 || conversionYearCount % 2 === 0) {
        storyEntries.push({
          year: year.year,
          age: year.age,
          trigger: 'conversion_year',
          headline: `Year ${conversionYearCount} of ${totalConversionYears}`,
          body: `We convert another ${formatCurrency(year.conversionAmount)} this year, staying within the ${targetBracket}% bracket. Your Roth balance grows to ${formatCurrency(year.rothBalance)}.`,
          metrics: [
            { label: 'Converted', value: formatCurrency(year.conversionAmount) },
            { label: 'Roth Balance', value: formatCurrency(year.rothBalance) },
          ],
          runningTotals: {
            totalConverted: formatCurrency(totalConverted),
            totalTaxPaid: formatCurrency(totalTaxPaid),
            rothBalance: formatCurrency(year.rothBalance),
            iraBalance: formatCurrency(year.traditionalBalance),
          },
          icon: 'progress',
          sentiment: 'neutral',
        });
      }
    } else {
      // Non-conversion year - still update totals
      totalConverted += year.conversionAmount || 0;
      totalTaxPaid += taxPaidThisYear || 0;
    }

    // HALFWAY CONVERTED
    if (!hasHitHalfway && totalConverted >= startingWithBonus / 2 && totalConverted > 0) {
      hasHitHalfway = true;
      const remaining = startingWithBonus - totalConverted;
      // Don't duplicate if same year as another major event
      if (!storyEntries.find(e => e.year === year.year && e.trigger === 'conversion_end')) {
        storyEntries.push({
          year: year.year,
          age: year.age,
          trigger: 'halfway_converted',
          headline: '50% Converted',
          body: `Half of your original IRA is now in tax-free Roth. You've converted ${formatCurrency(totalConverted)} so far, with approximately ${formatCurrency(Math.max(0, remaining))} left to convert.`,
          runningTotals: {
            totalConverted: formatCurrency(totalConverted),
            totalTaxPaid: formatCurrency(totalTaxPaid),
            rothBalance: formatCurrency(year.rothBalance),
            iraBalance: formatCurrency(year.traditionalBalance),
          },
          icon: 'progress',
          sentiment: 'positive',
        });
      }
    }

    // FULLY CONVERTED (Traditional IRA near zero)
    if (!hasFullyConverted && year.traditionalBalance < 100000 && totalConverted > 0 && prevYear && prevYear.traditionalBalance > 100000) {
      hasFullyConverted = true;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'fully_converted',
        headline: '100% Tax-Free',
        body: `Your Traditional IRA is now essentially empty. Your retirement savings of ${formatCurrency(year.rothBalance)} are in your Roth IRA, growing tax-free and passing to your heirs tax-free.`,
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'celebration',
        sentiment: 'positive',
      });
    }

    // BREAK-EVEN (Roth balance exceeds total taxes paid)
    if (!hasHitBreakEven && year.rothBalance >= totalTaxPaid && totalTaxPaid > 0) {
      hasHitBreakEven = true;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'break_even',
        headline: 'Break-Even Reached',
        body: `Your Roth balance of ${formatCurrency(year.rothBalance)} now exceeds the total taxes you paid to convert (${formatCurrency(totalTaxPaid)}). From here on, every dollar of growth is pure tax-free gain.`,
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'celebration',
        sentiment: 'positive',
      });
    }

    // ROTH EXCEEDS ORIGINAL IRA
    if (!hasExceededOriginal && year.rothBalance >= originalIRA && originalIRA > 0) {
      hasExceededOriginal = true;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'roth_exceeds_original',
        headline: 'Roth Exceeds Original IRA',
        body: `Your Roth balance of ${formatCurrency(year.rothBalance)} has surpassed your original IRA balance of ${formatCurrency(originalIRA)}. Tax-free growth is now working in your favor.`,
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'celebration',
        sentiment: 'positive',
      });
    }

    // SOCIAL SECURITY START
    if (!ssStarted && year.age >= primarySsStartAge && primarySsAmount > 0) {
      ssStarted = true;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'social_security_start',
        headline: 'Social Security Begins',
        body: `Your Social Security income of ${formatCurrency(primarySsAmount)}/year starts this year. Because your conversions are complete, this income doesn't push you into a higher bracket during conversion years.`,
        metrics: [
          { label: 'Annual SS', value: formatCurrency(primarySsAmount) },
        ],
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'milestone',
        sentiment: 'neutral',
      });
    }

    // SPOUSE SOCIAL SECURITY START
    if (!spouseSsStarted && client.spouse_name && year.age >= spouseSsStartAge && spouseSsAmount > 0) {
      spouseSsStarted = true;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'spouse_ss_start',
        headline: `${client.spouse_name}'s Social Security Begins`,
        body: `${client.spouse_name}'s Social Security income of ${formatCurrency(spouseSsAmount)}/year begins. Combined household Social Security is now ${formatCurrency(primarySsAmount + spouseSsAmount)}/year.`,
        metrics: [
          { label: 'Spouse SS', value: formatCurrency(spouseSsAmount) },
          { label: 'Combined SS', value: formatCurrency(primarySsAmount + spouseSsAmount) },
        ],
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'milestone',
        sentiment: 'neutral',
      });
    }

    // RMD AGE (73 is current RMD start age)
    if (year.age === 73) {
      const baselineRMD = baselineYear?.rmdAmount ?? 0;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'rmd_age',
        headline: 'RMDs Would Start Now',
        body: `At age ${year.age}, the IRS would force you to withdraw from a Traditional IRA — whether you need it or not. But because you converted to Roth, you have no RMDs. Your money stays invested and growing tax-free.`,
        comparison: baselineRMD > 0
          ? `Baseline scenario: You would be forced to withdraw ${formatCurrency(baselineRMD)}/year and pay taxes on every dollar.`
          : `Baseline scenario: You would be required to start taking mandatory distributions.`,
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'milestone',
        sentiment: 'positive',
      });
    }

    // DECADE SNAPSHOTS (70, 80, 90)
    if ([70, 80, 90].includes(year.age)) {
      // Calculate tax-free growth
      const taxFreeGrowth = year.rothBalance - totalConverted;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'decade_snapshot',
        headline: `Age ${year.age} Snapshot`,
        body: `At age ${year.age}, your Roth balance has grown to ${formatCurrency(year.rothBalance)}. If something happened today, your heirs would receive this amount completely tax-free.`,
        metrics: [
          { label: 'Roth Balance', value: formatCurrency(year.rothBalance) },
          { label: 'Tax-Free Growth', value: formatCurrency(Math.max(0, taxFreeGrowth)) },
        ],
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'milestone',
        sentiment: 'neutral',
      });
    }
  });

  // FINAL: DEATH/LEGACY SUMMARY
  const finalYear = years[years.length - 1];
  const baseFinalTraditional = projection.baseline_final_traditional;
  const baseHeirTax = Math.round(baseFinalTraditional * heirTaxRate);
  const baselineNetLegacy = projection.baseline_final_net_worth - baseHeirTax;
  const strategyLegacy = finalYear.rothBalance + finalYear.traditionalBalance;
  const difference = strategyLegacy - baselineNetLegacy;

  storyEntries.push({
    year: finalYear.year,
    age: finalYear.age,
    trigger: 'death_legacy',
    headline: 'What Your Heirs Receive',
    body: `When you pass, your heirs receive ${formatCurrency(finalYear.rothBalance)} from your Roth IRA completely tax-free. No income tax, no waiting, no complications.`,
    comparison: `Without this strategy, heirs would receive approximately ${formatCurrency(baselineNetLegacy)} after paying ${formatCurrency(baseHeirTax)} in taxes on the inherited Traditional IRA.`,
    metrics: [
      { label: 'Strategy: To Heirs', value: formatCurrency(strategyLegacy) },
      { label: 'Baseline: To Heirs', value: formatCurrency(baselineNetLegacy) },
      { label: 'Extra Wealth Created', value: formatCurrency(difference) },
    ],
    runningTotals: {
      totalConverted: formatCurrency(totalConverted),
      totalTaxPaid: formatCurrency(totalTaxPaid),
      rothBalance: formatCurrency(finalYear.rothBalance),
      iraBalance: formatCurrency(finalYear.traditionalBalance),
    },
    icon: 'end',
    sentiment: 'positive',
  });

  // Sort by year to ensure correct order
  storyEntries.sort((a, b) => a.year - b.year || getTrigggerPriority(a.trigger) - getTrigggerPriority(b.trigger));

  // Remove duplicate years with same trigger
  const uniqueEntries = storyEntries.filter((entry, index, arr) => {
    if (index === 0) return true;
    const prev = arr[index - 1];
    return !(entry.year === prev.year && entry.trigger === prev.trigger);
  });

  return uniqueEntries;
}

// Priority for same-year events
function getTrigggerPriority(trigger: StoryTrigger): number {
  const priorities: Record<StoryTrigger, number> = {
    'conversion_start': 1,
    'conversion_year': 2,
    'halfway_converted': 3,
    'conversion_end': 4,
    'fully_converted': 5,
    'break_even': 6,
    'roth_exceeds_original': 7,
    'social_security_start': 8,
    'spouse_ss_start': 9,
    'rmd_age': 10,
    'decade_snapshot': 11,
    'projection_end': 12,
    'death_legacy': 13,
  };
  return priorities[trigger] ?? 99;
}
