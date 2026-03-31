"use client";

import { useMemo } from "react";
import { X, ArrowLeft, Rocket, TrendingUp, MapPin, AlertTriangle, Target, Flag } from "lucide-react";
import type { Client } from "@/lib/types/client";
import type { Projection } from "@/lib/types/projection";
import { generateStory, type StoryEntry, type StoryIcon, type StorySentiment } from "@/lib/calculations/story-generator";
import { cn } from "@/lib/utils";

interface StoryModeProps {
  client: Client;
  projection: Projection;
  onExit: () => void;
}

// Icon mapping
const iconMap: Record<StoryIcon, React.ReactNode> = {
  start: <Rocket className="h-5 w-5" />,
  progress: <TrendingUp className="h-5 w-5" />,
  milestone: <MapPin className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
  celebration: <Target className="h-5 w-5" />,
  end: <Flag className="h-5 w-5" />,
};

// Emoji mapping for headlines
const emojiMap: Record<StoryIcon, string> = {
  start: '🚀',
  progress: '📊',
  milestone: '📍',
  warning: '⚠️',
  celebration: '🎯',
  end: '🏁',
};

export function StoryMode({ client, projection, onExit }: StoryModeProps) {
  const storyEntries = useMemo(() => {
    return generateStory(client, projection);
  }, [client, projection]);

  const startAge = client.age ?? 62;
  const endAge = client.end_age ?? 100;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-border-default bg-sidebar">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-text-dim hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm font-medium">Exit Story Mode</span>
        </button>
        <div className="flex items-center gap-3">
          {/* Future: Export PDF button */}
        </div>
      </div>

      {/* Story Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-12 px-6">
          {/* Story Title */}
          <div className="text-center mb-12">
            <p className="text-gold text-sm uppercase tracking-[3px] mb-3 font-medium">
              Roth Conversion Story
            </p>
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              {client.name}
            </h1>
            <p className="text-text-muted text-lg">
              Age {startAge} → Age {endAge}
            </p>
          </div>

          {/* Disclaimer */}
          <div className="text-center mb-10 px-4">
            <p className="text-text-dim text-xs italic leading-relaxed">
              The following illustration uses generic product archetypes to demonstrate potential outcomes.
              This is not a representation of any specific carrier&apos;s product. Actual features and results will vary.
            </p>
          </div>

          {/* Story Cards */}
          <div className="relative">
            {/* Vertical connection line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.1)]" style={{
              backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 8px, transparent 8px, transparent 16px)'
            }} />

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

// Story Card Component
function StoryCard({ entry, isLast }: { entry: StoryEntry; isLast: boolean }) {
  const isCelebration = ['break_even', 'roth_exceeds_original', 'fully_converted', 'conversion_end'].includes(entry.trigger);
  const isLegacy = entry.trigger === 'death_legacy';

  // Determine styling based on sentiment and type
  const cardStyles = cn(
    "relative ml-16 mb-6 rounded-2xl p-7",
    "border transition-all",
    isCelebration && "bg-[rgba(212,175,55,0.05)] border-gold-border",
    isLegacy && "bg-[rgba(74,222,128,0.05)] border-green/20",
    !isCelebration && !isLegacy && "bg-bg-card border-border-default",
    entry.sentiment === 'caution' && "bg-[rgba(250,204,21,0.05)] border-[rgba(250,204,21,0.2)]"
  );

  const headlineColor = cn(
    "text-xl font-medium mb-4",
    entry.sentiment === 'positive' && isCelebration && "text-gold",
    entry.sentiment === 'positive' && isLegacy && "text-green",
    entry.sentiment === 'caution' && "text-yellow-400",
    !isCelebration && !isLegacy && entry.sentiment !== 'caution' && "text-foreground"
  );

  // Left border accent for sentiment
  const leftBorderStyle = cn(
    "absolute left-0 top-6 bottom-6 w-1 rounded-full",
    entry.sentiment === 'positive' && "bg-gold",
    entry.sentiment === 'neutral' && "bg-[rgba(255,255,255,0.2)]",
    entry.sentiment === 'caution' && "bg-yellow-400"
  );

  return (
    <div className="relative">
      {/* Icon marker on the timeline */}
      <div className={cn(
        "absolute left-4 w-8 h-8 rounded-full flex items-center justify-center z-10",
        isCelebration && "bg-gold text-background",
        isLegacy && "bg-[#4ade80] text-background",
        !isCelebration && !isLegacy && "bg-[rgba(255,255,255,0.1)] text-text-dim",
        entry.sentiment === 'caution' && "bg-yellow-400 text-background"
      )}>
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
        <h3 className={headlineColor}>
          {entry.headline}
        </h3>

        {/* Body */}
        <p className="text-text-dim text-[15px] leading-relaxed mb-5">
          {entry.body}
        </p>

        {/* Metrics */}
        {entry.metrics && entry.metrics.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-5">
            {entry.metrics.map((metric, idx) => (
              <div
                key={idx}
                className="bg-bg-input border border-border-default rounded-xl px-4 py-3"
              >
                <p className="text-xs uppercase tracking-wider text-text-dim mb-1">
                  {metric.label}
                </p>
                <p className={cn(
                  "text-lg font-mono font-medium",
                  metric.label.toLowerCase().includes('extra') || metric.label.toLowerCase().includes('strategy')
                    ? "text-gold"
                    : "text-foreground"
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
            <p className="text-sm text-text-muted italic">
              {entry.comparison}
            </p>
          </div>
        )}

        {/* Running Totals Footer */}
        <div className="border-t border-border-default pt-4 mt-5">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-text-dim">
            <span>Converted: <span className="text-text-dim">{entry.runningTotals.totalConverted}</span></span>
            <span>Tax Paid: <span className="text-text-dim">{entry.runningTotals.totalTaxPaid}</span></span>
            <span>Roth: <span className="text-green">{entry.runningTotals.rothBalance}</span></span>
            <span>IRA: <span className="text-text-dim">{entry.runningTotals.iraBalance}</span></span>
          </div>
        </div>
      </div>

      {/* Connection arrow to next card */}
      {!isLast && (
        <div className="absolute left-[31px] -bottom-1 text-text-dim">
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
            <path d="M5 0V10M5 10L1 6M5 10L9 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}
