"use client";

import { useMemo } from "react";
import { ArrowLeft, Rocket, TrendingUp, MapPin, Shield, Target, Flag, DollarSign, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Projection } from "@/lib/types/projection";
import type { Client } from "@/lib/types/client";

interface GIStoryModeProps {
  client: Client;
  projection: Projection;
  onClose: () => void;
}

// Currency formatter
const toUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

// Story entry type
interface StoryEntry {
  year: number;
  age: number;
  trigger: string;
  headline: string;
  body: string;
  icon: "start" | "progress" | "milestone" | "shield" | "celebration" | "income" | "end";
  sentiment: "positive" | "neutral" | "caution";
  metrics?: { label: string; value: string }[];
  comparison?: string;
  runningTotals: {
    totalConverted: string;
    totalTaxPaid: string;
    rothBalance: string;
    incomeBase: string;
    cumulativeIncome: string;
  };
}

// Icon mapping
const iconMap: Record<string, React.ReactNode> = {
  start: <Rocket className="h-5 w-5" />,
  progress: <TrendingUp className="h-5 w-5" />,
  milestone: <MapPin className="h-5 w-5" />,
  shield: <Shield className="h-5 w-5" />,
  celebration: <Target className="h-5 w-5" />,
  income: <DollarSign className="h-5 w-5" />,
  end: <Flag className="h-5 w-5" />,
};

// Emoji mapping
const emojiMap: Record<string, string> = {
  start: "🚀",
  progress: "📊",
  milestone: "📍",
  shield: "🛡️",
  celebration: "🎯",
  income: "💰",
  end: "🏁",
};

// Generate story entries from projection data
function generateGIStory(client: Client, projection: Projection): StoryEntry[] {
  const entries: StoryEntry[] = [];
  const giYearlyData = projection.gi_yearly_data || [];
  const baselineYearlyData = projection.gi_baseline_yearly_data || [];

  if (giYearlyData.length === 0) return entries;

  const carrierName = client.carrier_name || "the carrier";
  const productName = client.product_name || "the annuity";
  const incomeStartAge = projection.gi_income_start_age || client.income_start_age || 70;
  const conversionYears = projection.gi_conversion_phase_years || 5;
  const strategyIncome = projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0;
  const baselineNetIncome = projection.gi_baseline_annual_income_net || 0;
  const baselineTax = projection.gi_baseline_annual_tax || 0;
  const annualAdvantage = projection.gi_annual_income_advantage || (strategyIncome - baselineNetIncome);
  const totalConversionTax = projection.gi_total_conversion_tax || 0;
  const breakEvenYears = projection.gi_break_even_years || 0;
  const depletionAge = projection.gi_depletion_age;
  const rollUpRate = 8;
  const deferralYears = projection.gi_deferral_years || 10;

  // Running totals
  let cumulativeConverted = 0;
  let cumulativeTax = 0;
  let cumulativeIncome = 0;
  let conversionYearCount = 0;
  let deferralYearCount = 0;
  let incomeYearCount = 0;
  let hasPassedDepletion = false;
  let lastRothBalance = 0;
  let startingIncomeBase = 0;
  let currentIncomeBase = 0;

  for (let i = 0; i < giYearlyData.length; i++) {
    const row = giYearlyData[i];
    const prevRow = i > 0 ? giYearlyData[i - 1] : null;

    // Update running totals
    if (row.phase === "conversion") {
      cumulativeConverted += row.conversionAmount || 0;
      cumulativeTax += row.conversionTax || 0;
      conversionYearCount++;
      lastRothBalance = row.rothBalance || 0;
    }

    if (row.incomeBase > 0) {
      currentIncomeBase = row.incomeBase;
    }

    if (row.phase === "income") {
      cumulativeIncome += row.guaranteedIncomeNet || 0;
      incomeYearCount++;
    }

    const runningTotals = {
      totalConverted: toUSD(cumulativeConverted),
      totalTaxPaid: toUSD(cumulativeTax),
      rothBalance: toUSD(lastRothBalance),
      incomeBase: toUSD(currentIncomeBase),
      cumulativeIncome: toUSD(cumulativeIncome),
    };

    // CONVERSION START
    if (row.phase === "conversion" && conversionYearCount === 1) {
      entries.push({
        year: row.year,
        age: row.age,
        trigger: "conversion_start",
        headline: "Your Journey Begins",
        body: `This year, you convert ${toUSD(row.conversionAmount || 0)} from your Traditional IRA to Roth. You pay ${toUSD(row.conversionTax || 0)} in taxes — but this is the last time this money will ever be taxed.`,
        icon: "start",
        sentiment: "positive",
        metrics: [
          { label: "Converted", value: toUSD(row.conversionAmount || 0) },
          { label: "Tax Paid", value: toUSD(row.conversionTax || 0) },
          { label: "Remaining IRA", value: toUSD(row.traditionalBalance || 0) },
        ],
        runningTotals,
      });
    }

    // CONVERSION COMPLETE
    else if (row.phase === "conversion" && conversionYearCount === conversionYears) {
      entries.push({
        year: row.year,
        age: row.age,
        trigger: "conversion_complete",
        headline: "Conversion Complete!",
        body: `Your Traditional IRA is now empty. Over ${conversionYears} years, you moved ${toUSD(cumulativeConverted)} to your Roth and paid ${toUSD(cumulativeTax)} in taxes. This money will never be taxed again.`,
        icon: "celebration",
        sentiment: "positive",
        metrics: [
          { label: "Total Converted", value: toUSD(cumulativeConverted) },
          { label: "Total Tax", value: toUSD(cumulativeTax) },
          { label: "Roth Balance", value: toUSD(row.rothBalance || 0) },
        ],
        runningTotals,
      });
    }

    // GI PURCHASE
    else if (row.phase === "purchase") {
      startingIncomeBase = row.incomeBase || 0;
      entries.push({
        year: row.year,
        age: row.age,
        trigger: "gi_purchase",
        headline: "Securing Your Guarantee",
        body: `Your ${toUSD(projection.gi_purchase_amount || lastRothBalance)} Roth balance is now a contract with ${carrierName}. You've purchased ${productName} inside your Roth IRA — guaranteeing income for life.`,
        icon: "shield",
        sentiment: "positive",
        metrics: [
          { label: "Premium", value: toUSD(projection.gi_purchase_amount || lastRothBalance) },
          { label: "Income Base", value: toUSD(row.incomeBase || 0) },
          { label: "Roll-Up Rate", value: `${rollUpRate}%` },
        ],
        comparison: `Your Income Base will grow at ${rollUpRate}% compound for ${deferralYears} years — guaranteed regardless of market performance.`,
        runningTotals,
      });
    }

    // DEFERRAL - Every 3 years or key milestones
    else if (row.phase === "deferral") {
      if (prevRow?.phase === "purchase") {
        deferralYearCount = 1;
      } else if (prevRow?.phase === "deferral") {
        deferralYearCount++;
      }

      // Show at years 3, 6, 9 or last deferral year
      const isLastDeferral = i + 1 < giYearlyData.length && giYearlyData[i + 1].phase === "income";
      if (deferralYearCount === 3 || deferralYearCount === 6 || deferralYearCount === 9 || isLastDeferral) {
        const growth = (row.incomeBase || 0) - startingIncomeBase;
        const growthPct = startingIncomeBase > 0 ? ((growth / startingIncomeBase) * 100).toFixed(0) : "0";

        if (isLastDeferral) {
          entries.push({
            year: row.year,
            age: row.age,
            trigger: "rollup_complete",
            headline: "Roll-Up Complete!",
            body: `After ${deferralYears} years of ${rollUpRate}% compound growth, your Income Base is locked at ${toUSD(row.incomeBase || 0)}. You started with ${toUSD(startingIncomeBase)} — the roll-up added ${toUSD(growth)}.`,
            icon: "celebration",
            sentiment: "positive",
            metrics: [
              { label: "Starting Base", value: toUSD(startingIncomeBase) },
              { label: "Final Base", value: toUSD(row.incomeBase || 0) },
              { label: "Growth", value: `+${growthPct}%` },
            ],
            runningTotals,
          });
        } else {
          entries.push({
            year: row.year,
            age: row.age,
            trigger: "rollup_milestone",
            headline: `Year ${deferralYearCount} of Growth`,
            body: `Your Income Base has grown to ${toUSD(row.incomeBase || 0)}. That's ${toUSD(growth)} of guaranteed growth since purchase.`,
            icon: "progress",
            sentiment: "positive",
            metrics: [
              { label: "Income Base", value: toUSD(row.incomeBase || 0) },
              { label: "Growth", value: `+${toUSD(growth)}` },
              { label: "Years Left", value: `${deferralYears - deferralYearCount}` },
            ],
            runningTotals,
          });
        }
      }
    }

    // INCOME START
    else if (row.phase === "income" && prevRow?.phase !== "income") {
      entries.push({
        year: row.year,
        age: row.age,
        trigger: "income_start",
        headline: "Tax-Free Income Begins!",
        body: `From today forward, you receive ${toUSD(strategyIncome)} every year — tax-free, guaranteed, for life. If this were in a Traditional IRA, you'd only net ${toUSD(baselineNetIncome)} after paying ${toUSD(baselineTax)} in taxes.`,
        icon: "income",
        sentiment: "positive",
        metrics: [
          { label: "Your Income", value: toUSD(strategyIncome) },
          { label: "Traditional Net", value: toUSD(baselineNetIncome) },
          { label: "Annual Advantage", value: `+${toUSD(annualAdvantage)}` },
        ],
        comparison: `You're keeping ${toUSD(annualAdvantage)} more every year because Roth income is tax-free.`,
        runningTotals,
      });
    }

    // BREAK EVEN
    else if (row.phase === "income" && breakEvenYears > 0 && incomeYearCount === Math.ceil(breakEvenYears)) {
      entries.push({
        year: row.year,
        age: row.age,
        trigger: "break_even",
        headline: "Break-Even Reached!",
        body: `The ${toUSD(totalConversionTax)} you paid in conversion taxes has been fully recovered through tax savings. From here on, every dollar of tax-free income is pure profit.`,
        icon: "celebration",
        sentiment: "positive",
        metrics: [
          { label: "Tax Paid", value: toUSD(totalConversionTax) },
          { label: "Tax Saved", value: toUSD(annualAdvantage * incomeYearCount) },
          { label: "Years", value: `${Math.ceil(breakEvenYears)}` },
        ],
        runningTotals,
      });
    }

    // ACCOUNT DEPLETION
    else if (row.phase === "income" && depletionAge && row.age === depletionAge && !hasPassedDepletion) {
      hasPassedDepletion = true;
      entries.push({
        year: row.year,
        age: row.age,
        trigger: "account_depletion",
        headline: "The Guarantee Kicks In",
        body: `Your account value has reached $0, but your income continues. ${carrierName} will now pay your ${toUSD(strategyIncome)}/year from their reserves — for as long as you live.`,
        icon: "shield",
        sentiment: "positive",
        metrics: [
          { label: "Income Received", value: toUSD(cumulativeIncome) },
          { label: "Years of Income", value: `${incomeYearCount}` },
          { label: "Continues At", value: `${toUSD(strategyIncome)}/yr` },
        ],
        comparison: "This is the core promise of guaranteed income — your money ran out, but your paycheck didn't.",
        runningTotals,
      });
    }

    // DECADE SNAPSHOTS (80, 90, 100)
    else if (row.phase === "income" && [80, 90, 100].includes(row.age)) {
      const baselineCumulative = baselineYearlyData.slice(0, i + 1).reduce((sum, r) => sum + (r.guaranteedIncomeNet || 0), 0);
      const advantage = cumulativeIncome - baselineCumulative;

      entries.push({
        year: row.year,
        age: row.age,
        trigger: "decade_snapshot",
        headline: `Age ${row.age} — ${incomeYearCount} Years of Income`,
        body: `You've received ${toUSD(cumulativeIncome)} in tax-free income. A Traditional GI would have paid ${toUSD(baselineCumulative)} after taxes — ${toUSD(advantage)} less.`,
        icon: "milestone",
        sentiment: "positive",
        metrics: [
          { label: "Your Total", value: toUSD(cumulativeIncome) },
          { label: "Traditional", value: toUSD(baselineCumulative) },
          { label: "Advantage", value: `+${toUSD(advantage)}` },
        ],
        runningTotals,
      });
    }
  }

  // FINAL SUMMARY
  const lastRow = giYearlyData[giYearlyData.length - 1];
  const baselineTotalNet = baselineYearlyData.reduce((sum, r) => sum + (r.guaranteedIncomeNet || 0), 0);
  const totalAdvantage = cumulativeIncome - baselineTotalNet;

  entries.push({
    year: lastRow?.year || 0,
    age: lastRow?.age || client.end_age || 100,
    trigger: "projection_end",
    headline: "Your Legacy",
    body: `At age ${lastRow?.age || client.end_age}, you will have received ${toUSD(cumulativeIncome)} in tax-free income. The Traditional path would have given you ${toUSD(baselineTotalNet)} — you kept ${toUSD(totalAdvantage)} more. And if you live longer? The income continues.`,
    icon: "end",
    sentiment: "positive",
    metrics: [
      { label: "Your Lifetime Income", value: toUSD(cumulativeIncome) },
      { label: "Traditional Would Be", value: toUSD(baselineTotalNet) },
      { label: "Extra Wealth", value: `+${toUSD(totalAdvantage)}` },
    ],
    runningTotals: {
      totalConverted: toUSD(cumulativeConverted),
      totalTaxPaid: toUSD(cumulativeTax),
      rothBalance: "$0",
      incomeBase: toUSD(currentIncomeBase),
      cumulativeIncome: toUSD(cumulativeIncome),
    },
  });

  return entries;
}

// Story Card Component
function StoryCard({ entry, isLast }: { entry: StoryEntry; isLast: boolean }) {
  const isCelebration = ["conversion_complete", "rollup_complete", "income_start", "break_even"].includes(entry.trigger);
  const isLegacy = entry.trigger === "projection_end";
  const isShield = entry.trigger === "account_depletion" || entry.trigger === "gi_purchase";

  const cardStyles = cn(
    "relative ml-16 mb-6 rounded-2xl p-7 border transition-all",
    isCelebration && "bg-[rgba(212,175,55,0.05)] border-[rgba(212,175,55,0.2)]",
    isLegacy && "bg-[rgba(74,222,128,0.05)] border-[rgba(74,222,128,0.2)]",
    isShield && !isCelebration && "bg-[rgba(59,130,246,0.05)] border-[rgba(59,130,246,0.2)]",
    !isCelebration && !isLegacy && !isShield && "bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)]"
  );

  const headlineColor = cn(
    "text-xl font-medium mb-4",
    isCelebration && "text-gold",
    isLegacy && "text-[#4ade80]",
    isShield && !isCelebration && "text-[#3b82f6]",
    !isCelebration && !isLegacy && !isShield && "text-white"
  );

  const leftBorderStyle = cn(
    "absolute left-0 top-6 bottom-6 w-1 rounded-full",
    isCelebration && "bg-gold",
    isLegacy && "bg-[#4ade80]",
    isShield && !isCelebration && "bg-[#3b82f6]",
    !isCelebration && !isLegacy && !isShield && "bg-[rgba(255,255,255,0.2)]"
  );

  const iconBgColor = cn(
    "absolute left-4 w-8 h-8 rounded-full flex items-center justify-center z-10",
    isCelebration && "bg-gold text-[#0a0a0a]",
    isLegacy && "bg-[#4ade80] text-[#0a0a0a]",
    isShield && !isCelebration && "bg-[#3b82f6] text-white",
    !isCelebration && !isLegacy && !isShield && "bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.6)]"
  );

  return (
    <div className="relative">
      {/* Icon marker */}
      <div className={iconBgColor}>
        {iconMap[entry.icon]}
      </div>

      {/* Card */}
      <div className={cardStyles}>
        <div className={leftBorderStyle} />

        {/* Year/Age Badge */}
        <p className="text-gold text-sm font-mono mb-3">
          {emojiMap[entry.icon]} {entry.year} · Age {entry.age}
        </p>

        {/* Headline */}
        <h3 className={headlineColor}>{entry.headline}</h3>

        {/* Body */}
        <p className="text-[rgba(255,255,255,0.6)] text-[15px] leading-relaxed mb-5">
          {entry.body}
        </p>

        {/* Metrics */}
        {entry.metrics && entry.metrics.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-5">
            {entry.metrics.map((metric, idx) => (
              <div
                key={idx}
                className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3"
              >
                <p className="text-[11px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] mb-1">
                  {metric.label}
                </p>
                <p className={cn(
                  "text-lg font-mono font-medium",
                  metric.label.toLowerCase().includes("advantage") ||
                  metric.label.toLowerCase().includes("extra") ||
                  metric.label.toLowerCase().includes("your")
                    ? "text-gold"
                    : "text-white"
                )}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Comparison Callout */}
        {entry.comparison && (
          <div className="bg-[rgba(212,175,55,0.05)] border-l-[3px] border-gold rounded-r-lg px-4 py-3 mt-4">
            <p className="text-sm text-[rgba(255,255,255,0.5)] italic">
              {entry.comparison}
            </p>
          </div>
        )}

        {/* Running Totals Footer */}
        <div className="border-t border-[rgba(255,255,255,0.07)] pt-4 mt-5">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-[rgba(255,255,255,0.4)]">
            <span>Converted: <span className="text-[rgba(255,255,255,0.6)]">{entry.runningTotals.totalConverted}</span></span>
            <span>Tax Paid: <span className="text-[rgba(255,255,255,0.6)]">{entry.runningTotals.totalTaxPaid}</span></span>
            <span>Income Base: <span className="text-gold">{entry.runningTotals.incomeBase}</span></span>
            <span>Cumulative Income: <span className="text-[#4ade80]">{entry.runningTotals.cumulativeIncome}</span></span>
          </div>
        </div>
      </div>

      {/* Connection arrow */}
      {!isLast && (
        <div className="absolute left-[31px] -bottom-1 text-[rgba(255,255,255,0.2)]">
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
            <path d="M5 0V10M5 10L1 6M5 10L9 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}

// Main GI Story Mode Component
export function GIStoryMode({ client, projection, onClose }: GIStoryModeProps) {
  const storyEntries = useMemo(() => generateGIStory(client, projection), [client, projection]);

  const startAge = client.age ?? 55;
  const endAge = client.end_age ?? 100;

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(0,0,0,0.3)]">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-[rgba(255,255,255,0.6)] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-medium">Exit Story Mode</span>
        </button>
      </div>

      {/* Story Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-12 px-6">
          {/* Story Title */}
          <div className="text-center mb-12">
            <p className="text-gold text-sm uppercase tracking-[3px] mb-3 font-medium">
              Tax-Free Income Story
            </p>
            <h1 className="text-3xl font-semibold text-white mb-2">
              {client.name}
            </h1>
            <p className="text-[rgba(255,255,255,0.5)] text-lg">
              Age {startAge} → Age {endAge}
            </p>
          </div>

          {/* Story Cards */}
          <div className="relative">
            {/* Vertical connection line */}
            <div
              className="absolute left-8 top-0 bottom-0 w-0.5"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 8px, transparent 8px, transparent 16px)",
              }}
            />

            {storyEntries.map((entry, index) => (
              <StoryCard
                key={`${entry.year}-${entry.trigger}`}
                entry={entry}
                isLast={index === storyEntries.length - 1}
              />
            ))}
          </div>

          {/* Bottom spacing */}
          <div className="h-20" />
        </div>
      </div>
    </div>
  );
}
