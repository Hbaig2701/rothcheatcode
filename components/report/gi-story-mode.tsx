"use client";

import { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Download, Sparkles, TrendingUp, DollarSign, Shield, Trophy, Gift } from "lucide-react";
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

// Story card types
type MilestoneType =
  | "conversion_start"
  | "conversion_year"
  | "conversion_complete"
  | "gi_purchase"
  | "deferral_start"
  | "rollup_milestone"
  | "rollup_complete"
  | "income_start"
  | "break_even"
  | "account_depletion"
  | "income_continues"
  | "decade_snapshot"
  | "projection_end";

interface StoryCard {
  type: MilestoneType;
  year: number;
  age: number;
  headline: string;
  body: string;
  metrics: { label: string; value: string; highlight?: "gold" | "green" | "red" }[];
  footer?: string;
  isCelebration?: boolean;
}

// Generate story cards from projection data
function generateStoryCards(client: Client, projection: Projection): StoryCard[] {
  const cards: StoryCard[] = [];
  const giYearlyData = projection.gi_yearly_data || [];
  const baselineYearlyData = projection.gi_baseline_yearly_data || [];

  if (giYearlyData.length === 0) return cards;

  const carrierName = client.carrier_name || "the carrier";
  const productName = client.product_name || "the annuity";
  const incomeStartAge = projection.gi_income_start_age || client.income_start_age || 70;
  const conversionYears = projection.gi_conversion_phase_years || 5;
  const strategyIncome = projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0;
  const baselineGrossIncome = projection.gi_baseline_annual_income_gross || 0;
  const baselineNetIncome = projection.gi_baseline_annual_income_net || 0;
  const baselineTax = projection.gi_baseline_annual_tax || 0;
  const annualAdvantage = projection.gi_annual_income_advantage || (strategyIncome - baselineNetIncome);
  const totalConversionTax = projection.gi_total_conversion_tax || 0;
  const breakEvenYears = projection.gi_break_even_years || 0;
  const depletionAge = projection.gi_depletion_age;
  const rollUpRate = 8; // Default for most products
  const deferralYears = projection.gi_deferral_years || 10;

  // Track cumulative values
  let cumulativeConverted = 0;
  let cumulativeTax = 0;
  let cumulativeIncome = 0;
  let conversionYearCount = 0;
  let deferralYearCount = 0;
  let incomeYearCount = 0;
  let hasPassedDepletion = false;
  let lastRothBalance = 0;
  let startingIncomeBase = 0;

  for (let i = 0; i < giYearlyData.length; i++) {
    const row = giYearlyData[i];
    const prevRow = i > 0 ? giYearlyData[i - 1] : null;
    const baselineRow = baselineYearlyData[i];

    // Track cumulative values
    if (row.phase === "conversion") {
      cumulativeConverted += row.conversionAmount || 0;
      cumulativeTax += row.conversionTax || 0;
      conversionYearCount++;
      lastRothBalance = row.rothBalance || 0;
    }

    if (row.phase === "income") {
      cumulativeIncome += row.guaranteedIncomeNet || 0;
      incomeYearCount++;
    }

    // CONVERSION_START - First year of conversion
    if (row.phase === "conversion" && conversionYearCount === 1) {
      cards.push({
        type: "conversion_start",
        year: row.year,
        age: row.age,
        headline: "YOUR JOURNEY BEGINS",
        body: `This year, you convert ${toUSD(row.conversionAmount || 0)} from your Traditional IRA to Roth and pay ${toUSD(row.conversionTax || 0)} in taxes.\n\nThis is the investment that will pay off for the rest of your life. Every dollar in your Roth will grow tax-free and pay you tax-free income forever.`,
        metrics: [
          { label: "Converted", value: toUSD(row.conversionAmount || 0), highlight: "gold" },
          { label: "Tax Paid", value: toUSD(row.conversionTax || 0), highlight: "red" },
          { label: "Roth Balance", value: toUSD(row.rothBalance || 0), highlight: "green" },
        ],
        footer: `Traditional IRA remaining: ${toUSD(row.traditionalBalance || 0)}`,
      });
    }

    // CONVERSION_YEAR - Middle years of conversion (show every year or every other)
    else if (row.phase === "conversion" && conversionYearCount > 1 && conversionYearCount < conversionYears) {
      // Only show every other year to reduce clutter, unless it's a short conversion period
      if (conversionYears <= 3 || conversionYearCount % 2 === 0) {
        cards.push({
          type: "conversion_year",
          year: row.year,
          age: row.age,
          headline: `YEAR ${conversionYearCount} OF CONVERSION`,
          body: `Another ${toUSD(row.conversionAmount || 0)} moves to your Roth. You pay ${toUSD(row.conversionTax || 0)} in taxes — but remember, this is the last time this money will ever be taxed.`,
          metrics: [
            { label: "Converted This Year", value: toUSD(row.conversionAmount || 0), highlight: "gold" },
            { label: "Total Converted", value: toUSD(cumulativeConverted), highlight: "gold" },
            { label: "Total Tax Paid", value: toUSD(cumulativeTax), highlight: "red" },
          ],
          footer: `Traditional IRA remaining: ${toUSD(row.traditionalBalance || 0)}`,
        });
      }
    }

    // CONVERSION_COMPLETE - Last year of conversion
    else if (row.phase === "conversion" && conversionYearCount === conversionYears) {
      cards.push({
        type: "conversion_complete",
        year: row.year,
        age: row.age,
        headline: "CONVERSION COMPLETE",
        body: `Your Traditional IRA is now empty. Over ${conversionYears} years, you moved ${toUSD(cumulativeConverted)} to your Roth and paid ${toUSD(cumulativeTax)} in taxes.\n\nThis money will never be taxed again — not when it grows, not when you withdraw it, not when you pass it on.\n\nYour Roth balance: ${toUSD(row.rothBalance || 0)}`,
        metrics: [
          { label: "Total Converted", value: toUSD(cumulativeConverted), highlight: "gold" },
          { label: "Total Tax Paid", value: toUSD(cumulativeTax), highlight: "red" },
          { label: "Final Roth Balance", value: toUSD(row.rothBalance || 0), highlight: "green" },
        ],
        isCelebration: true,
      });
    }

    // GI_PURCHASE - When the annuity is purchased
    else if (row.phase === "purchase") {
      startingIncomeBase = row.incomeBase || 0;
      cards.push({
        type: "gi_purchase",
        year: row.year,
        age: row.age,
        headline: "SECURING YOUR GUARANTEE",
        body: `Today, your ${toUSD(projection.gi_purchase_amount || lastRothBalance)} Roth balance becomes a promise.\n\nYou purchase ${productName} from ${carrierName} inside your Roth IRA. This isn't just an investment — it's a contract that guarantees you income for life, no matter how long you live or what the market does.\n\nYour Income Base starts at ${toUSD(row.incomeBase || 0)}.`,
        metrics: [
          { label: "Premium", value: toUSD(projection.gi_purchase_amount || lastRothBalance), highlight: "gold" },
          { label: "Bonus", value: `${client.bonus_percent || 0}%`, highlight: "green" },
          { label: "Starting Income Base", value: toUSD(row.incomeBase || 0), highlight: "gold" },
        ],
        footer: `Roll-up begins: ${rollUpRate}% compound for up to ${deferralYears} years`,
      });
    }

    // DEFERRAL_START - First year of deferral
    else if (row.phase === "deferral" && prevRow?.phase === "purchase") {
      deferralYearCount = 1;
      cards.push({
        type: "deferral_start",
        year: row.year,
        age: row.age,
        headline: "THE GROWTH PHASE BEGINS",
        body: `Your Income Base is now growing at ${rollUpRate}% compound — guaranteed, regardless of market performance.\n\nThis isn't stock market growth that could disappear in a crash. This is a contractual guarantee from ${carrierName}.`,
        metrics: [
          { label: "Income Base", value: toUSD(row.incomeBase || 0), highlight: "gold" },
          { label: "Guaranteed Roll-Up", value: `${rollUpRate}%`, highlight: "gold" },
          { label: "Years Remaining", value: `${deferralYears - deferralYearCount}`, highlight: "muted" as any },
        ],
      });
    }

    // ROLLUP_MILESTONE - Every 3 years during deferral
    else if (row.phase === "deferral" && prevRow?.phase === "deferral") {
      deferralYearCount++;
      if (deferralYearCount % 3 === 0 && deferralYearCount < deferralYears) {
        const growth = (row.incomeBase || 0) - startingIncomeBase;
        const growthPct = startingIncomeBase > 0 ? (growth / startingIncomeBase) * 100 : 0;
        cards.push({
          type: "rollup_milestone",
          year: row.year,
          age: row.age,
          headline: `YEAR ${deferralYearCount} OF GROWTH`,
          body: `Your Income Base has grown to ${toUSD(row.incomeBase || 0)}.\n\nThat's ${toUSD(growth)} of guaranteed growth since you purchased the annuity. The ${rollUpRate}% compound roll-up continues working for you.`,
          metrics: [
            { label: "Starting Income Base", value: toUSD(startingIncomeBase), highlight: "muted" as any },
            { label: "Current Income Base", value: toUSD(row.incomeBase || 0), highlight: "gold" },
            { label: "Growth", value: `+${toUSD(growth)} (+${growthPct.toFixed(0)}%)`, highlight: "green" },
          ],
          footer: `${deferralYears - deferralYearCount} years of roll-up remaining`,
        });
      }
    }

    // INCOME_START - First income payment
    else if (row.phase === "income" && prevRow?.phase !== "income") {
      const finalIncomeBase = projection.gi_income_base_at_income_age || row.incomeBase || 0;
      const totalRollUpGrowth = finalIncomeBase - startingIncomeBase;

      // Add rollup_complete card first
      cards.push({
        type: "rollup_complete",
        year: row.year,
        age: row.age,
        headline: "ROLL-UP COMPLETE",
        body: `After ${deferralYears} years of ${rollUpRate}% compound growth, your Income Base is now locked at ${toUSD(finalIncomeBase)}.\n\nYou started with ${toUSD(startingIncomeBase)}. The guaranteed roll-up added ${toUSD(totalRollUpGrowth)} — ${startingIncomeBase > 0 ? `${((totalRollUpGrowth / startingIncomeBase) * 100).toFixed(0)}% growth` : ""}.\n\nYour Income Base is now locked. It won't decrease, no matter what happens.`,
        metrics: [
          { label: "Starting Income Base", value: toUSD(startingIncomeBase), highlight: "muted" as any },
          { label: "Final Income Base", value: toUSD(finalIncomeBase), highlight: "gold" },
          { label: "Total Roll-Up Growth", value: `+${toUSD(totalRollUpGrowth)}`, highlight: "green" },
        ],
        isCelebration: true,
      });

      // Then add income_start card
      cards.push({
        type: "income_start",
        year: row.year,
        age: row.age,
        headline: "YOUR TAX-FREE INCOME BEGINS",
        body: `From this day forward, you receive ${toUSD(strategyIncome)} every year for the rest of your life.\n\nNot gross income minus taxes. Not income that might change. ${toUSD(strategyIncome)} — tax-free, guaranteed, forever.\n\nIf you had kept this money in a Traditional IRA, you'd receive ${toUSD(baselineGrossIncome)} gross but pay ${toUSD(baselineTax)} in taxes, leaving you with only ${toUSD(baselineNetIncome)}.\n\nYou're keeping ${toUSD(annualAdvantage)} more every year.`,
        metrics: [
          { label: "Your Tax-Free Income", value: toUSD(strategyIncome), highlight: "gold" },
          { label: "Traditional Would Net", value: toUSD(baselineNetIncome), highlight: "muted" as any },
          { label: "Your Annual Advantage", value: `+${toUSD(annualAdvantage)}`, highlight: "green" },
        ],
        isCelebration: true,
      });
    }

    // BREAK_EVEN - When cumulative tax savings exceed conversion tax
    else if (row.phase === "income" && breakEvenYears > 0 && incomeYearCount === Math.ceil(breakEvenYears)) {
      cards.push({
        type: "break_even",
        year: row.year,
        age: row.age,
        headline: "BREAK-EVEN REACHED",
        body: `The ${toUSD(totalConversionTax)} you paid in conversion taxes has now been fully recovered through tax savings.\n\nFrom this point forward, every dollar of tax-free income is pure profit. The strategy has paid for itself — ${Math.ceil(breakEvenYears)} years ahead of a traditional approach.`,
        metrics: [
          { label: "Conversion Tax Paid", value: toUSD(totalConversionTax), highlight: "red" },
          { label: "Tax Savings To Date", value: toUSD(annualAdvantage * incomeYearCount), highlight: "green" },
          { label: "Years to Break-Even", value: `${Math.ceil(breakEvenYears)}`, highlight: "gold" },
        ],
        isCelebration: true,
      });
    }

    // ACCOUNT_DEPLETION - When account value hits $0
    else if (row.phase === "income" && depletionAge && row.age === depletionAge && !hasPassedDepletion) {
      hasPassedDepletion = true;
      cards.push({
        type: "account_depletion",
        year: row.year,
        age: row.age,
        headline: "THE GUARANTEE KICKS IN",
        body: `Your Accumulation Value has reached $0. In a traditional investment, this would be the end — you'd have nothing left.\n\nBut this is a guaranteed income product. ${carrierName} will now pay your ${toUSD(strategyIncome)} annual income from their reserves.\n\nYou've already received ${toUSD(cumulativeIncome)} in tax-free income. And there's more to come — for as long as you live.`,
        metrics: [
          { label: "Income Received So Far", value: toUSD(cumulativeIncome), highlight: "green" },
          { label: "Years of Income Received", value: `${incomeYearCount}`, highlight: "gold" },
          { label: "Guaranteed to Continue", value: `${toUSD(strategyIncome)}/year`, highlight: "gold" },
        ],
        isCelebration: true,
      });
    }

    // DECADE_SNAPSHOT - Ages 80, 90, 100
    else if (row.phase === "income" && [80, 90, 100].includes(row.age)) {
      const baselineCumulative = baselineYearlyData.slice(0, i + 1).reduce((sum, r) => sum + (r.guaranteedIncomeNet || 0), 0);
      const cumulativeAdvantage = cumulativeIncome - baselineCumulative;

      cards.push({
        type: "decade_snapshot",
        year: row.year,
        age: row.age,
        headline: `AGE ${row.age} — ${incomeYearCount} YEARS OF INCOME`,
        body: `You've now received ${incomeYearCount} years of tax-free guaranteed income, totaling ${toUSD(cumulativeIncome)}.\n\nIf you had taken the Traditional GI route, you would have received ${toUSD(baselineCumulative)} after taxes — that's ${toUSD(cumulativeAdvantage)} less in your pocket.`,
        metrics: [
          { label: "Your Total Income", value: toUSD(cumulativeIncome), highlight: "green" },
          { label: "Traditional Would Be", value: toUSD(baselineCumulative), highlight: "muted" as any },
          { label: "Your Advantage", value: `+${toUSD(cumulativeAdvantage)}`, highlight: "green" },
        ],
      });
    }
  }

  // PROJECTION_END - Final card
  const lastRow = giYearlyData[giYearlyData.length - 1];
  const incomeYears = incomeYearCount;
  const baselineTotalNet = baselineYearlyData.reduce((sum, r) => sum + (r.guaranteedIncomeNet || 0), 0);
  const totalAdvantage = cumulativeIncome - baselineTotalNet;

  cards.push({
    type: "projection_end",
    year: lastRow?.year || 0,
    age: lastRow?.age || client.end_age || 100,
    headline: "YOUR LEGACY",
    body: `At age ${lastRow?.age || client.end_age}, you will have received ${toUSD(cumulativeIncome)} in tax-free guaranteed income over ${incomeYears} years.\n\nThe Traditional GI path would have given you ${toUSD(baselineTotalNet)} after taxes.\n\nBy converting to Roth and buying your guaranteed income inside it, you kept an extra ${toUSD(totalAdvantage)} — money that stayed in your pocket instead of going to taxes.\n\nAnd if you live past ${lastRow?.age || client.end_age}? The income continues. For life.`,
    metrics: [
      { label: "Total Tax-Free Income", value: toUSD(cumulativeIncome), highlight: "green" },
      { label: "Traditional Would Be", value: toUSD(baselineTotalNet), highlight: "muted" as any },
      { label: "Tax-Free Wealth Created", value: `+${toUSD(totalAdvantage)}`, highlight: "green" },
    ],
    isCelebration: true,
  });

  return cards;
}

// Story Card Component
function StoryCardDisplay({ card, isActive }: { card: StoryCard; isActive: boolean }) {
  const iconMap: Record<MilestoneType, React.ReactNode> = {
    conversion_start: <Sparkles className="w-5 h-5" />,
    conversion_year: <TrendingUp className="w-5 h-5" />,
    conversion_complete: <Trophy className="w-5 h-5" />,
    gi_purchase: <Shield className="w-5 h-5" />,
    deferral_start: <TrendingUp className="w-5 h-5" />,
    rollup_milestone: <TrendingUp className="w-5 h-5" />,
    rollup_complete: <Trophy className="w-5 h-5" />,
    income_start: <DollarSign className="w-5 h-5" />,
    break_even: <Trophy className="w-5 h-5" />,
    account_depletion: <Shield className="w-5 h-5" />,
    income_continues: <DollarSign className="w-5 h-5" />,
    decade_snapshot: <Gift className="w-5 h-5" />,
    projection_end: <Trophy className="w-5 h-5" />,
  };

  return (
    <div
      className={cn(
        "w-full max-w-2xl mx-auto transition-all duration-300",
        isActive ? "opacity-100 scale-100" : "opacity-50 scale-95 pointer-events-none"
      )}
    >
      <div
        className={cn(
          "rounded-2xl p-8 border",
          card.isCelebration
            ? "bg-[rgba(212,175,55,0.08)] border-[rgba(212,175,55,0.25)]"
            : "bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                card.isCelebration
                  ? "bg-[rgba(212,175,55,0.2)] text-gold"
                  : "bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.5)]"
              )}
            >
              {iconMap[card.type]}
            </div>
            <span className="text-lg font-mono text-[rgba(255,255,255,0.6)]">{card.year}</span>
          </div>
          <span className="text-2xl font-mono font-medium text-white">Age {card.age}</span>
        </div>

        {/* Headline */}
        <h2
          className={cn(
            "text-2xl font-display font-semibold mb-4 tracking-wide",
            card.isCelebration ? "text-gold" : "text-white"
          )}
        >
          {card.headline}
        </h2>

        {/* Body */}
        <p className="text-base text-[rgba(255,255,255,0.7)] leading-relaxed whitespace-pre-line mb-6">
          {card.body}
        </p>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {card.metrics.map((metric, idx) => (
            <div
              key={idx}
              className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4 text-center"
            >
              <p className="text-xs uppercase tracking-wide text-[rgba(255,255,255,0.4)] mb-1">
                {metric.label}
              </p>
              <p
                className={cn(
                  "text-lg font-mono font-medium",
                  metric.highlight === "gold" && "text-gold",
                  metric.highlight === "green" && "text-[#4ade80]",
                  metric.highlight === "red" && "text-[#f87171]",
                  !metric.highlight && "text-white"
                )}
              >
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        {card.footer && (
          <p className="text-sm text-[rgba(255,255,255,0.4)] italic pt-4 border-t border-[rgba(255,255,255,0.05)]">
            {card.footer}
          </p>
        )}
      </div>
    </div>
  );
}

// Main Story Mode Component
export function GIStoryMode({ client, projection, onClose }: GIStoryModeProps) {
  const cards = useMemo(() => generateStoryCards(client, projection), [client, projection]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Quick jump phases
  const phases = [
    { label: "Conversion", index: cards.findIndex((c) => c.type === "conversion_start") },
    { label: "Purchase", index: cards.findIndex((c) => c.type === "gi_purchase") },
    { label: "Income", index: cards.findIndex((c) => c.type === "income_start") },
    { label: "Summary", index: cards.length - 1 },
  ].filter((p) => p.index >= 0);

  const currentCard = cards[currentIndex];

  if (!currentCard) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0c0c0c] flex items-center justify-center">
        <p className="text-[rgba(255,255,255,0.5)]">No story data available</p>
        <button onClick={onClose} className="absolute top-4 right-4 text-white">
          <X className="w-6 h-6" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0c0c] flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.07)]">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Exit Story Mode</span>
        </button>

        <p className="text-lg font-display text-white">
          Presenting: <span className="text-gold">{client.name}</span>
        </p>

        <button className="flex items-center gap-2 text-[rgba(255,255,255,0.5)] hover:text-white transition-colors">
          <Download className="w-5 h-5" />
          <span>Export PDF</span>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto py-12 px-6">
        <StoryCardDisplay card={currentCard} isActive={true} />
      </div>

      {/* Bottom navigation */}
      <div className="border-t border-[rgba(255,255,255,0.07)] px-6 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {/* Prev button */}
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              currentIndex === 0
                ? "text-[rgba(255,255,255,0.25)] cursor-not-allowed"
                : "text-[rgba(255,255,255,0.6)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
            )}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>

          {/* Progress indicator */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm text-[rgba(255,255,255,0.5)]">
              Card {currentIndex + 1} of {cards.length}
            </span>

            {/* Quick jump links */}
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[rgba(255,255,255,0.4)]">Skip to:</span>
              {phases.map((phase) => (
                <button
                  key={phase.label}
                  onClick={() => setCurrentIndex(phase.index)}
                  className={cn(
                    "px-2 py-1 rounded transition-colors",
                    currentIndex === phase.index
                      ? "bg-gold text-[#0c0c0c] font-medium"
                      : "text-[rgba(255,255,255,0.5)] hover:text-white"
                  )}
                >
                  {phase.label}
                </button>
              ))}
            </div>
          </div>

          {/* Next button */}
          <button
            onClick={goToNext}
            disabled={currentIndex === cards.length - 1}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              currentIndex === cards.length - 1
                ? "text-[rgba(255,255,255,0.25)] cursor-not-allowed"
                : "text-[rgba(255,255,255,0.6)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
            )}
          >
            <span>Next</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
