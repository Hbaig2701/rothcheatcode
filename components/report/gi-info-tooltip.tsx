"use client";

import { useState, useRef, useEffect } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalculationLine {
  label: string;
  value: string;
  highlight?: "gold" | "green" | "red" | "muted";
  isSeparator?: boolean;
  isResult?: boolean;
}

interface InfoTooltipProps {
  title: string;
  calculations?: CalculationLine[];
  explanation?: string;
  children?: React.ReactNode;
  className?: string;
}

// Currency formatter
const toUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

export function InfoTooltip({
  title,
  calculations,
  explanation,
  children,
  className,
}: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-4 h-4 rounded-full flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
        aria-label={`Info about ${title}`}
      >
        <Info className="w-3 h-3" />
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          className="absolute z-50 top-full right-0 mt-2 w-[360px] max-w-[90vw] bg-[rgba(12,12,12,0.98)] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
            <p className="text-[11px] uppercase tracking-[1.5px] text-[rgba(255,255,255,0.5)] font-medium">
              How This Is Calculated
            </p>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-4">
            {/* Title */}
            <p className="text-sm font-medium text-white">{title}</p>

            {/* Calculation breakdown */}
            {calculations && calculations.length > 0 && (
              <div className="font-mono text-[13px] space-y-1.5">
                {calculations.map((line, idx) => {
                  if (line.isSeparator) {
                    return (
                      <div
                        key={idx}
                        className="border-t border-[rgba(255,255,255,0.1)] my-2"
                      />
                    );
                  }

                  const valueColor = {
                    gold: "text-gold",
                    green: "text-[#4ade80]",
                    red: "text-[#f87171]",
                    muted: "text-[rgba(255,255,255,0.5)]",
                  }[line.highlight || "muted"];

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex justify-between items-center",
                        line.isResult && "font-semibold pt-1"
                      )}
                    >
                      <span className="text-[rgba(255,255,255,0.5)]">
                        {line.label}
                      </span>
                      <span className={valueColor}>{line.value}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom children content */}
            {children}

            {/* Explanation */}
            {explanation && (
              <p className="text-[13px] text-[rgba(255,255,255,0.5)] leading-relaxed pt-2 border-t border-[rgba(255,255,255,0.07)]">
                {explanation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Pre-built tooltip content generators for GI metrics
export function getTaxFreeWealthTooltip(
  strategyAnnualNet: number,
  baselineAnnualNet: number,
  incomeYears: number
) {
  const annualAdvantage = strategyAnnualNet - baselineAnnualNet;
  const lifetimeAdvantage = annualAdvantage * incomeYears;

  return {
    title: "TAX-FREE WEALTH CREATED",
    calculations: [
      { label: "Your Annual Income (tax-free)", value: toUSD(strategyAnnualNet), highlight: "green" as const },
      { label: "− Traditional Annual Income (after tax)", value: toUSD(baselineAnnualNet), highlight: "muted" as const },
      { isSeparator: true, label: "", value: "" },
      { label: "= Annual Advantage", value: toUSD(annualAdvantage), highlight: "gold" as const },
      { label: `× ${incomeYears} years of income`, value: `× ${incomeYears}`, highlight: "muted" as const },
      { isSeparator: true, label: "", value: "" },
      { label: "= Tax-Free Wealth Created", value: toUSD(lifetimeAdvantage), highlight: "green" as const, isResult: true },
    ],
    explanation: "This is the total additional income you keep over your lifetime by having tax-free Roth income instead of taxable Traditional IRA income.",
  };
}

export function getGuaranteedIncomeTooltip(
  finalIncomeBase: number,
  payoutRate: number,
  annualIncome: number,
  carrierName: string,
  incomeStartAge: number
) {
  return {
    title: "GUARANTEED ANNUAL INCOME",
    calculations: [
      { label: "Final Income Base", value: toUSD(finalIncomeBase), highlight: "muted" as const },
      { label: `× Payout Rate (age ${incomeStartAge})`, value: `× ${payoutRate.toFixed(2)}%`, highlight: "muted" as const },
      { isSeparator: true, label: "", value: "" },
      { label: "= Guaranteed Annual Income", value: toUSD(annualIncome), highlight: "gold" as const, isResult: true },
    ],
    explanation: `This is the amount ${carrierName || "the carrier"} guarantees to pay you every year for life, starting at age ${incomeStartAge}. Because your annuity is inside a Roth IRA, this income is tax-free.`,
  };
}

export function getFinalIncomeBaseTooltip(
  purchaseAmount: number,
  bonusPercent: number,
  bonusAmount: number,
  startingIncomeBase: number,
  rollUpRate: number,
  rollUpYears: number,
  finalIncomeBase: number,
  carrierName: string
) {
  const rollUpMultiplier = Math.pow(1 + rollUpRate / 100, rollUpYears);

  return {
    title: "FINAL INCOME BASE (GLWB VALUE)",
    calculations: [
      { label: "Roth Balance at Purchase", value: toUSD(purchaseAmount), highlight: "muted" as const },
      { label: `+ Bonus (${bonusPercent}%)`, value: bonusAmount > 0 ? toUSD(bonusAmount) : "$0", highlight: bonusAmount > 0 ? "gold" as const : "muted" as const },
      { isSeparator: true, label: "", value: "" },
      { label: "= Starting Income Base", value: toUSD(startingIncomeBase), highlight: "muted" as const },
      { label: `× Roll-Up Growth (${rollUpRate}% × ${rollUpYears} yrs)`, value: `× ${rollUpMultiplier.toFixed(4)}`, highlight: "gold" as const },
      { isSeparator: true, label: "", value: "" },
      { label: "= Final Income Base", value: toUSD(finalIncomeBase), highlight: "gold" as const, isResult: true },
    ],
    explanation: `The Income Base (also called GLWB Value) is a calculation number — not real money. It determines how much guaranteed income you'll receive. The ${rollUpRate}% compound roll-up is guaranteed by ${carrierName || "the carrier"} regardless of market performance.`,
  };
}

export function getAnnualAdvantageTooltip(
  strategyNetIncome: number,
  baselineGrossIncome: number,
  taxRate: number,
  baselineNetIncome: number,
  annualAdvantage: number
) {
  const taxAmount = Math.round(baselineGrossIncome * (taxRate / 100));

  return {
    title: "ANNUAL INCOME ADVANTAGE",
    calculations: [
      { label: "Your Net Income (tax-free)", value: toUSD(strategyNetIncome), highlight: "green" as const },
      { label: "− Traditional Net Income", value: toUSD(baselineNetIncome), highlight: "muted" as const },
      { isSeparator: true, label: "", value: "" },
      { label: "= Annual Advantage", value: toUSD(annualAdvantage), highlight: "green" as const, isResult: true },
    ],
    explanation: `Every year, you receive ${toUSD(annualAdvantage)} more than you would with a Traditional IRA because you don't pay any tax on Roth withdrawals.`,
  };
}

export function getConversionTaxTooltip(
  conversionYears: { year: number; amount: number; tax: number }[],
  totalConverted: number,
  totalTax: number
) {
  const calculations: CalculationLine[] = conversionYears.map((cy) => ({
    label: `Year ${cy.year}: ${toUSD(cy.amount)}`,
    value: toUSD(cy.tax),
    highlight: "red" as const,
  }));

  calculations.push({ isSeparator: true, label: "", value: "" });
  calculations.push({
    label: "Total Conversion Tax",
    value: toUSD(totalTax),
    highlight: "red" as const,
    isResult: true,
  });

  return {
    title: "CONVERSION TAX PAID",
    calculations,
    explanation: "This is the upfront cost of the strategy — the taxes you paid to convert from Traditional to Roth. You pay this once, then never pay taxes on this money again.",
  };
}

export function getBreakEvenTooltip(
  conversionTax: number,
  annualSavings: number,
  breakEvenYears: number,
  incomeStartAge: number
) {
  return {
    title: "BREAK-EVEN POINT",
    calculations: [
      { label: "Conversion Tax Paid", value: toUSD(conversionTax), highlight: "red" as const },
      { label: "÷ Annual Tax Savings", value: toUSD(annualSavings), highlight: "green" as const },
      { isSeparator: true, label: "", value: "" },
      { label: "= Break-Even", value: `${breakEvenYears.toFixed(1)} years`, highlight: "gold" as const, isResult: true },
    ],
    explanation: `After ${breakEvenYears.toFixed(1)} years of receiving income (age ${incomeStartAge + Math.ceil(breakEvenYears)}), your tax savings will have fully recovered the conversion taxes you paid. Every year after that is pure profit.`,
  };
}

export function getDepletionAgeTooltip(
  depletionAge: number,
  annualIncome: number,
  cumulativeAtDepletion: number,
  carrierName: string
) {
  return {
    title: "ACCOUNT DEPLETION AGE",
    calculations: [
      { label: "Projected Depletion Age", value: `${depletionAge}`, highlight: "muted" as const },
      { label: "Income Received by Depletion", value: toUSD(cumulativeAtDepletion), highlight: "green" as const },
      { label: "Income Continues After", value: `${toUSD(annualIncome)}/yr`, highlight: "gold" as const },
    ],
    explanation: `At age ${depletionAge}, your Accumulation Value (the real money in the annuity) is projected to reach $0.\n\nYour guaranteed income does NOT stop. ${carrierName || "The carrier"} will continue paying you ${toUSD(annualIncome)} per year from their own reserves. This is the core promise of a guaranteed income product — income for life, no matter what.`,
  };
}
