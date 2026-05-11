import type { YearlyResult } from './types';
import type { Client } from '@/lib/types/client';
import type { Projection } from '@/lib/types/projection';

// Story entry types
export type StoryTrigger =
  | 'strategy_setup'        // NEW: opening card describing the chosen strategy
  | 'conversion_start'
  | 'conversion_year'
  | 'conversion_end'
  | 'partial_cap_reached'   // NEW: cumulative conversions hit target_partial_amount
  | 'aum_transfer_start'    // NEW: first AUM IRA-to-AUM pull
  | 'aum_transfer_complete' // NEW: AUM withdrawal phase finishes
  | 'voluntary_withdrawal'  // NEW: advisor-scheduled IRA/Roth pull happens
  | 'widow_first_death'     // NEW: widow_death_age reached
  | 'early_withdrawal_penalty' // NEW: 10% penalty incurred under 59½
  | 'carrier_cap_overflow'  // NEW: penalty-free cap binding, conversion tax overflow paid externally
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
  /**
   * Structured plan details rendered as a vertical labeled list. Used by
   * cards (like the strategy_setup opener) where the content is best read
   * as discrete facts rather than prose. Renders as label-left / value-right
   * rows with subtle dividers — same pattern as the report-page tooltips.
   */
  details?: StoryMetric[];
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

  // ===== Strategy-specific context =====
  // These drive the conditional cards below. Computed once and reused so the
  // story narrative reflects every dimension the engine actually modeled.
  const conversionType = client.conversion_type ?? 'optimized_amount';
  const partialTarget = client.target_partial_amount ?? 0;
  const fixedAmount = client.fixed_conversion_amount ?? 0;
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const taxPaymentSource = client.tax_payment_source ?? 'from_taxable';

  // AUM split context — pulled from the projection's separate aum_years array.
  const aumActive = (client.aum_allocation_percent ?? 0) > 0
    && Array.isArray(projection.aum_years)
    && projection.aum_years.length > 0;
  const aumYears = projection.aum_years ?? [];
  const aumWithdrawalYears = client.aum_withdrawal_years ?? 5;
  const aumStartingPortion = Math.round(originalIRA * ((client.aum_allocation_percent ?? 0) / 100));
  const aumTotalWithdrawn = aumYears.reduce((s, y) => s + (y.iraWithdrawal ?? 0), 0);
  const aumFinalBalance = projection.aum_final_balance ?? 0;
  // Year index when the AUM transfer phase ends (last year an iraWithdrawal
  // happens on the AUM side). Used to fire the "transfer complete" card.
  const aumTransferEndIndex = (() => {
    for (let i = aumYears.length - 1; i >= 0; i--) {
      if ((aumYears[i].iraWithdrawal ?? 0) > 0) return i;
    }
    return -1;
  })();

  // Widow analysis context.
  const widowAnalysisActive = client.widow_analysis === true;
  const widowDeathAge = client.widow_death_age ?? null;

  // Voluntary withdrawals — the advisor's hand-scheduled pulls. Engine writes
  // these into the projection's iraWithdrawal/rothWithdrawal fields. In the
  // combined blueprint_years, the AUM transfer also lands in iraWithdrawal,
  // so a year's "voluntary" IRA pull = total iraWithdrawal − whatever the AUM
  // engine recorded for that same year.
  const hasScheduledWithdrawals = (client.withdrawals?.length ?? 0) > 0;
  const aumIraWithdrawalsByYear = aumYears.map(y => y.iraWithdrawal ?? 0);
  let aumTransferStartFired = false;

  // Early-withdrawal penalty tracking — fires once the first year a penalty
  // appears in the combined data (under 59½).
  let earlyPenaltyFired = false;

  // Carrier penalty-free cap overflow tracker — first year the conversion
  // tax exceeds the carrier's free-withdrawal allowance and overflow has
  // to be funded externally. Surfaces as a one-time card so advisors can
  // explain the "your client writes a check for the part the carrier
  // wouldn't let us pull from inside the contract" line.
  let capOverflowFired = false;

  // Partial-cap tracking — fires when cumulative conversions reach the
  // configured target_partial_amount.
  let partialCapFired = false;

  // ===== STRATEGY SETUP (opening card) =====
  // Frames what the advisor configured: conversion type, AUM split, deferral,
  // tax-from-IRA, etc. Renders as a clean label/value list (via the `details`
  // field) rather than a paragraph — easier to scan, and the advisor can
  // point at any single line during a meeting.
  const setupDetails: StoryMetric[] = [];

  // Conversion plan — one line summarizing the chosen type + parameters.
  switch (conversionType) {
    case 'no_conversion':
      setupDetails.push({ label: 'Conversion plan', value: 'No conversions (baseline behavior)' });
      break;
    case 'full_conversion':
      setupDetails.push({ label: 'Conversion plan', value: 'Full conversion — empty the IRA upfront' });
      break;
    case 'fixed_amount':
      setupDetails.push({ label: 'Conversion plan', value: `Fixed ${formatCurrency(fixedAmount)}/year` });
      break;
    case 'partial_amount':
      setupDetails.push({ label: 'Conversion plan', value: `Partial — capped at ${formatCurrency(partialTarget)} cumulative` });
      break;
    default:
      setupDetails.push({ label: 'Conversion plan', value: `Optimized to fill the ${targetBracket}% bracket` });
  }

  if (yearsToDefer > 0) {
    setupDetails.push({
      label: 'Deferred',
      value: `${yearsToDefer} ${yearsToDefer === 1 ? 'year' : 'years'} — starts age ${(client.age ?? 62) + yearsToDefer}`,
    });
  }

  setupDetails.push({
    label: 'Tax payment source',
    value: taxPaymentSource === 'from_ira' ? 'From the IRA itself (gross-down)' : 'From outside funds',
  });

  if (aumActive) {
    setupDetails.push({
      label: 'Split allocation',
      value: `${100 - (client.aum_allocation_percent ?? 0)}% Roth · ${client.aum_allocation_percent}% AUM (${formatCurrency(aumStartingPortion)})`,
    });
    setupDetails.push({
      label: 'AUM transfer',
      value: `Over ${aumWithdrawalYears} ${aumWithdrawalYears === 1 ? 'year' : 'years'} · ${client.aum_fee_percent ?? 1}% annual fee`,
    });
  }

  if (hasScheduledWithdrawals) {
    setupDetails.push({
      label: 'Voluntary withdrawals',
      value: `${client.withdrawals?.length ?? 0} scheduled — separate from RMDs and conversions`,
    });
  }

  if (widowAnalysisActive) {
    setupDetails.push({
      label: "Widow's penalty",
      value: widowDeathAge != null
        ? `Modeled · first-death age ${widowDeathAge}`
        : 'Modeled · first-death age uses default heuristic',
    });
  }

  // Short framing sentence — cards above the timeline orient the advisor.
  // Detail rows do the heavy lifting underneath.
  const setupBody = aumActive || conversionType === 'no_conversion' || hasScheduledWithdrawals || widowAnalysisActive
    ? "Here's how this scenario is configured. Each line below is a parameter the advisor chose that drives the numbers in the rest of the timeline."
    : `Here's the plan. Roth conversions over ${totalConversionYears} ${totalConversionYears === 1 ? 'year' : 'years'} starting at age ${(client.age ?? 62) + yearsToDefer}, paid for from ${taxPaymentSource === 'from_ira' ? 'the IRA itself' : 'outside funds'}.`;

  storyEntries.push({
    year: years[0]?.year ?? new Date().getFullYear(),
    age: client.age ?? years[0]?.age ?? 62,
    trigger: 'strategy_setup',
    headline: 'How This Strategy Is Built',
    body: setupBody,
    details: setupDetails,
    metrics: [
      { label: 'Starting IRA', value: formatCurrency(originalIRA) },
      ...(client.bonus_percent && client.bonus_percent > 0 ? [{ label: 'Premium Bonus', value: `${client.bonus_percent}%` }] : []),
      ...(aumActive ? [{ label: 'AUM Split', value: `${client.aum_allocation_percent}%` }] : []),
    ],
    runningTotals: {
      totalConverted: formatCurrency(0),
      totalTaxPaid: formatCurrency(0),
      rothBalance: formatCurrency(client.roth_ira ?? 0),
      iraBalance: formatCurrency(originalIRA),
    },
    icon: 'start',
    sentiment: 'neutral',
  });

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

    // ============================================================
    // STRATEGY-SPECIFIC EVENT CARDS — fire conditionally based on the
    // advisor's configuration. Each is gated so it only fires when the
    // corresponding feature is active and the relevant year arrives.
    // ============================================================

    // AUM TRANSFER START — first year an IRA-to-AUM pull happens.
    const aumIraThisYear = aumIraWithdrawalsByYear[index] ?? 0;
    if (aumActive && !aumTransferStartFired && aumIraThisYear > 0) {
      aumTransferStartFired = true;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'aum_transfer_start',
        headline: 'AUM Transfer Begins',
        body: `Year 1 of the IRA-to-AUM transfer. We pull ${formatCurrency(aumIraThisYear)} from the Traditional IRA and route the after-tax amount into a managed brokerage account. Spreading the transfer over ${aumWithdrawalYears} ${aumWithdrawalYears === 1 ? 'year' : 'years'} keeps the client out of a single-year tax bracket spike.`,
        metrics: [
          { label: 'IRA Pull This Year', value: formatCurrency(aumIraThisYear) },
          { label: 'Total Allocation', value: formatCurrency(aumStartingPortion) },
          { label: 'Schedule', value: `${aumWithdrawalYears} ${aumWithdrawalYears === 1 ? 'year' : 'years'}` },
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

    // AUM TRANSFER COMPLETE — last year the IRA-to-AUM pull happens.
    if (aumActive && index === aumTransferEndIndex && aumTransferEndIndex >= 0) {
      const aumEoyBalance = aumYears[index]?.taxableBalance ?? 0;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'aum_transfer_complete',
        headline: 'AUM Transfer Complete',
        body: `The IRA-to-AUM transfer is finished. ${formatCurrency(aumTotalWithdrawn)} flowed out of the IRA over ${aumTransferEndIndex + 1} ${aumTransferEndIndex === 0 ? 'year' : 'years'} and now sits in the managed brokerage account at ${formatCurrency(aumEoyBalance)}. From here it grows subject to AUM fees and annual tax drag (dividends + realized cap gains), with step-up in basis at death so heirs don't owe tax on the embedded gains.`,
        metrics: [
          { label: 'Total Transferred', value: formatCurrency(aumTotalWithdrawn) },
          { label: 'AUM Balance', value: formatCurrency(aumEoyBalance) },
          { label: 'AUM Fee', value: `${client.aum_fee_percent ?? 1}%/yr` },
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

    // PARTIAL CAP REACHED — fires when cumulative conversions hit the cap.
    if (
      conversionType === 'partial_amount'
      && partialTarget > 0
      && !partialCapFired
      && totalConverted >= partialTarget
      && totalConverted > 0
    ) {
      partialCapFired = true;
      const leftInIra = year.traditionalBalance;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'partial_cap_reached',
        headline: 'Partial-Conversion Cap Reached',
        body: `Cumulative conversions have hit the configured target of ${formatCurrency(partialTarget)}. From this point forward, no more Roth conversions happen — the remaining ${formatCurrency(leftInIra)} stays in the Traditional IRA and grows tax-deferred until RMD age.`,
        metrics: [
          { label: 'Target', value: formatCurrency(partialTarget) },
          { label: 'Converted', value: formatCurrency(totalConverted) },
          { label: 'Remaining in IRA', value: formatCurrency(leftInIra) },
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

    // VOLUNTARY WITHDRAWAL — surfaces an advisor-scheduled pull (separate
    // from RMDs, conversions, and the AUM transfer). We compute "voluntary
    // IRA" as combined iraWithdrawal minus the AUM bucket's pull for that
    // same year, so the AUM transfer doesn't double-trigger this card. The
    // AUM brokerage may also absorb the IRA-side request the Roth-side IRA
    // couldn't satisfy (`aumScheduledWithdrawal` — taxed as a brokerage
    // liquidation, LTCG on gain only) — surface that as a third leg.
    if (hasScheduledWithdrawals) {
      const voluntaryIra = Math.max(0, (year.iraWithdrawal ?? 0) - aumIraThisYear);
      const voluntaryRoth = year.rothWithdrawal ?? 0;
      const voluntaryAum = year.aumScheduledWithdrawal ?? 0;
      if (voluntaryIra > 0 || voluntaryRoth > 0 || voluntaryAum > 0) {
        const parts: string[] = [];
        if (voluntaryIra > 0) parts.push(`${formatCurrency(voluntaryIra)} from the Traditional IRA (taxable income)`);
        if (voluntaryRoth > 0) parts.push(`${formatCurrency(voluntaryRoth)} from the Roth (tax-free, qualified)`);
        if (voluntaryAum > 0) parts.push(`${formatCurrency(voluntaryAum)} from the AUM brokerage (LTCG on the gain portion only)`);
        storyEntries.push({
          year: year.year,
          age: year.age,
          trigger: 'voluntary_withdrawal',
          headline: 'Voluntary Withdrawal',
          body: `The advisor's withdrawal schedule pulls ${parts.join(' and ')} this year. These are elective distributions on top of any RMDs or conversions — they reduce the bucket they came from for future years.`,
          metrics: [
            ...(voluntaryIra > 0 ? [{ label: 'IRA Pull', value: formatCurrency(voluntaryIra) }] : []),
            ...(voluntaryRoth > 0 ? [{ label: 'Roth Pull', value: formatCurrency(voluntaryRoth) }] : []),
            ...(voluntaryAum > 0 ? [{ label: 'AUM Pull', value: formatCurrency(voluntaryAum) }] : []),
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
    }

    // CARRIER CAP OVERFLOW — first year the conversion tax can't be fully
    // paid from inside the contract because of the penalty-free withdrawal
    // limit. The conversion still happens at the chosen size; only the tax
    // payment is split between IRA (up to cap) and external funds.
    const externalTaxThisYear = year.taxesPaidExternally ?? 0;
    if (!capOverflowFired && externalTaxThisYear > 0) {
      capOverflowFired = true;
      const internalTaxThisYear = year.taxesPaidFromIRA ?? 0;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'carrier_cap_overflow',
        headline: 'Carrier Penalty-Free Limit Reached',
        body: `The conversion tax for ${year.year} runs ${formatCurrency(internalTaxThisYear + externalTaxThisYear)}, but the carrier only allows ${formatCurrency(internalTaxThisYear)} (the penalty-free withdrawal allowance) to be pulled from inside the contract this year. The conversion proceeds at the chosen size — Roth conversions are intra-carrier transfers and don't count against the allowance — and the remaining ${formatCurrency(externalTaxThisYear)} of tax is assumed to be paid from external (non-IRA) funds. The cap releases automatically once the surrender period ends.`,
        metrics: [
          { label: 'Tax From IRA (Capped)', value: formatCurrency(internalTaxThisYear) },
          { label: 'Tax Paid Externally', value: formatCurrency(externalTaxThisYear) },
        ],
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'warning',
        sentiment: 'caution',
      });
    }

    // EARLY-WITHDRAWAL PENALTY — first year a 10% penalty is incurred.
    const penaltyThisYear = year.earlyWithdrawalPenalty ?? 0;
    if (!earlyPenaltyFired && penaltyThisYear > 0) {
      earlyPenaltyFired = true;
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'early_withdrawal_penalty',
        headline: '10% Early-Withdrawal Penalty',
        body: `Because the client is under 59½, IRA distributions used for ${aumActive ? 'the AUM transfer' : 'tax payment'} this year incur a 10% early-withdrawal penalty of ${formatCurrency(penaltyThisYear)} on top of the ordinary income tax. This applies every year the client is still under 59½ and the IRA gets pulled — once they cross that threshold, the penalty stops.`,
        metrics: [
          { label: 'Penalty This Year', value: formatCurrency(penaltyThisYear) },
        ],
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'warning',
        sentiment: 'caution',
      });
    }

    // WIDOW FIRST DEATH — fires the year first death occurs (when widow
    // analysis is on). The card flags that surviving-spouse single-bracket
    // RMDs are about to crush the baseline side, justifying the strategy.
    if (widowAnalysisActive && widowDeathAge != null && year.age === widowDeathAge) {
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'widow_first_death',
        headline: 'Filing Status Switches to Single',
        body: `In this year, the widow-analysis model assumes the first death occurs. From here on, the surviving spouse files single — narrower tax brackets and a smaller standard deduction. In the baseline scenario, every remaining RMD dollar is now taxed harder, which is one of the strategy's biggest advantages: the Roth has no RMDs to expose to those single brackets.`,
        runningTotals: {
          totalConverted: formatCurrency(totalConverted),
          totalTaxPaid: formatCurrency(totalTaxPaid),
          rothBalance: formatCurrency(year.rothBalance),
          iraBalance: formatCurrency(year.traditionalBalance),
        },
        icon: 'warning',
        sentiment: 'caution',
      });
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

    // BREAK-EVEN — fires at projection.break_even_age, the same tax-payback
    // age computed by the engine and shown on the Advanced Analysis chart.
    // Definition: first year where strategy cumulative totalTax ≤ baseline
    // cumulative totalTax. Using the engine's value here keeps story, the
    // Advanced Analysis breakeven, and any other "breakeven" surface in the
    // report aligned to the dollar/year. (Previously this fired on a local
    // condition, year.rothBalance >= totalTaxPaid, which gave a different
    // age and confused advisors comparing the two views.)
    if (projection.break_even_age != null && year.age === projection.break_even_age) {
      storyEntries.push({
        year: year.year,
        age: year.age,
        trigger: 'break_even',
        headline: 'Tax Payback Reached',
        body: `At age ${year.age}, the strategy has fully recovered the upfront conversion tax through annual tax savings. From here on, you pay less in taxes every year than you would by doing nothing.`,
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
  // Both sides use projection.*_final_net_worth − heirTax(traditional). This
  // is the same formula the results-page "Legacy to Heirs" stat card uses, so
  // the two views reconcile to the dollar. final_net_worth includes the
  // (signed) taxable balance — when conversion tax is paid externally, that
  // balance is negative and represents real cost to the strategy. Earlier
  // versions summed roth + traditional only and missed that cost, producing
  // numbers $200K+ higher than the dashboard for clients paying tax from
  // taxable accounts.
  const finalYear = years[years.length - 1];
  const baseFinalTraditional = projection.baseline_final_traditional;
  const baseHeirTax = Math.round(baseFinalTraditional * heirTaxRate);
  const baselineNetLegacy = projection.baseline_final_net_worth - baseHeirTax;
  const strategyHeirTax = Math.round(finalYear.traditionalBalance * heirTaxRate);
  const strategyLegacy = projection.blueprint_final_net_worth - strategyHeirTax;
  const difference = strategyLegacy - baselineNetLegacy;

  // Tailor the body so the legacy story reflects what's actually in the
  // estate: Roth alone if no split, or Roth + AUM brokerage when AUM is on.
  const legacyBody = aumActive
    ? `When you pass, your heirs receive ${formatCurrency(strategyLegacy)}. The Roth IRA (${formatCurrency(finalYear.rothBalance)}) passes completely tax-free, and the AUM brokerage (${formatCurrency(aumFinalBalance)}) gets a step-up in basis at death — heirs owe nothing on the unrealized gains accumulated during life.`
    : `When you pass, your heirs receive ${formatCurrency(strategyLegacy)} — your Roth IRA passes completely tax-free, with no income tax, no waiting, no complications.`;

  storyEntries.push({
    year: finalYear.year,
    age: finalYear.age,
    trigger: 'death_legacy',
    headline: 'What Your Heirs Receive',
    body: legacyBody,
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

// Priority for same-year events. Lower = appears first.
// New triggers slotted in so AUM/withdrawal/widow events read in a
// natural order alongside the existing milestones.
function getTrigggerPriority(trigger: StoryTrigger): number {
  const priorities: Record<StoryTrigger, number> = {
    'strategy_setup': 0,            // Always first if the year matches
    'aum_transfer_start': 1,        // Same-year as conversion_start usually
    'conversion_start': 2,
    'conversion_year': 3,
    'voluntary_withdrawal': 4,
    'aum_transfer_complete': 5,
    'halfway_converted': 6,
    'conversion_end': 7,
    'partial_cap_reached': 8,
    'fully_converted': 9,
    'early_withdrawal_penalty': 10,
    'carrier_cap_overflow': 11,     // Same-year as conversion_year typically
    'break_even': 12,
    'roth_exceeds_original': 13,
    'social_security_start': 14,
    'spouse_ss_start': 15,
    'widow_first_death': 16,
    'rmd_age': 17,
    'decade_snapshot': 18,
    'projection_end': 19,
    'death_legacy': 20,
  };
  return priorities[trigger] ?? 99;
}
