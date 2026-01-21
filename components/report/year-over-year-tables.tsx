"use client";

import { useState, useEffect, useMemo } from "react";
import { YearlyResult } from "@/lib/calculations/types";
import { cn } from "@/lib/utils";
import { Client } from "@/lib/types/client";
import { getStandardDeduction } from "@/lib/data/standard-deductions";
import { getBracketCeiling } from "@/lib/data/federal-brackets-2026";

interface YearOverYearTablesProps {
  baselineYears: YearlyResult[];
  blueprintYears: YearlyResult[];
  client: Client;
}

type Scenario = "baseline" | "blueprint";
type TabId = "account" | "taxable" | "irmaa" | "netIncome" | "conversion";

interface Tab {
  id: TabId;
  label: string;
  showAlways: boolean;
}

const TABS: Tab[] = [
  { id: "account", label: "Account Values", showAlways: true },
  { id: "taxable", label: "Taxable Income", showAlways: true },
  { id: "irmaa", label: "IRMAA", showAlways: true },
  { id: "netIncome", label: "Net Income", showAlways: true },
  { id: "conversion", label: "Conversion Details", showAlways: false },
];

// Helper: Format currency (values are in cents)
const formatCurrency = (value: number): string => {
  if (value === 0) return "0";
  const dollars = value / 100;
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
};

// Helper: Format percentage
const formatPercent = (value: number): string => `${value}%`;

// Helper: Format age (handles MFJ)
const formatAge = (primaryAge: number, spouseAge: number | null): string => {
  if (spouseAge !== null && spouseAge > 0) {
    return `${primaryAge} / ${spouseAge}`;
  }
  return primaryAge.toString();
};

// Helper: Get IRMAA tier string
const getIRMAATier = (age: number, irmaaSurcharge: number): string => {
  if (age < 65) return "Pre-IRMAA";
  if (irmaaSurcharge === 0) return "Tier 1";
  // Map surcharge amount to tier (simplified - actual mapping would need thresholds)
  const annualSurcharge = irmaaSurcharge / 100;
  if (annualSurcharge < 1000) return "Tier 1";
  if (annualSurcharge < 2500) return "Tier 2";
  if (annualSurcharge < 4000) return "Tier 3";
  if (annualSurcharge < 5500) return "Tier 4";
  if (annualSurcharge < 7000) return "Tier 5";
  return "Tier 6";
};

// Helper: Determine tax bracket from taxable income and filing status
const determineBracket = (taxableIncome: number, filingStatus: string): number => {
  const income = taxableIncome / 100; // Convert to dollars

  if (filingStatus === "married_filing_jointly") {
    if (income <= 23850) return 10;
    if (income <= 96950) return 12;
    if (income <= 206700) return 22;
    if (income <= 403550) return 24;
    if (income <= 487450) return 32;
    if (income <= 731200) return 35;
    return 37;
  } else {
    // Single and other statuses
    if (income <= 11925) return 10;
    if (income <= 48475) return 12;
    if (income <= 103350) return 22;
    if (income <= 201775) return 24;
    if (income <= 243725) return 32;
    if (income <= 609350) return 35;
    return 37;
  }
};

export function YearOverYearTables({
  baselineYears,
  blueprintYears,
  client,
}: YearOverYearTablesProps) {
  const [scenario, setScenario] = useState<Scenario>("blueprint");
  const [activeTab, setActiveTab] = useState<TabId>("account");

  // Auto-switch from conversion tab when switching to baseline
  useEffect(() => {
    if (scenario === "baseline" && activeTab === "conversion") {
      setActiveTab("account");
    }
  }, [scenario, activeTab]);

  // Get the years data based on selected scenario
  const years = scenario === "baseline" ? baselineYears : blueprintYears;

  // Compute derived data for each year
  const computedData = useMemo(() => {
    return years.map((year, index) => {
      // B.O.Y. Combined - use previous year's E.O.Y. or initial for first year
      const prevYear = index > 0 ? years[index - 1] : null;
      const boyTraditional = prevYear
        ? prevYear.traditionalBalance
        : scenario === "blueprint"
          ? Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 10) / 100))
          : (client.qualified_account_value ?? 0);
      const boyRoth = prevYear ? prevYear.rothBalance : (client.roth_ira ?? 0);
      const boyCombined = boyTraditional + boyRoth;

      // E.O.Y. Combined
      const eoyCombined = year.traditionalBalance + year.rothBalance;

      // Distribution from IRA
      const distIra = scenario === "baseline" ? year.rmdAmount : year.conversionAmount;

      // Interest = E.O.Y. - B.O.Y. + Dist (since E.O.Y. = B.O.Y. - Dist + Interest)
      const interest = eoyCombined - boyCombined + distIra;

      // AGI calculation
      const grossIncome = year.otherIncome + distIra;
      const agi = grossIncome;

      // Standard deduction
      const deduction = getStandardDeduction(
        client.filing_status,
        year.age,
        year.spouseAge ?? undefined,
        year.year
      );

      // Taxable income
      const taxableIncome = Math.max(0, agi - deduction);

      // Tax bracket
      const bracket = determineBracket(taxableIncome, client.filing_status);

      // MAGI for IRMAA
      const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;
      const magi = agi + taxExemptNonSSI + year.ssIncome;

      // Net income calculation
      const netIncome =
        year.otherIncome +
        taxExemptNonSSI +
        year.ssIncome +
        distIra -
        year.totalTax -
        year.irmaaSurcharge -
        (scenario === "blueprint" ? year.conversionAmount : 0);

      return {
        ...year,
        boyTraditional,
        boyRoth,
        boyCombined,
        eoyCombined,
        distIra,
        interest,
        agi,
        deduction,
        taxableIncome,
        bracket,
        taxExemptNonSSI,
        magi,
        netIncome,
        irmaaTier: getIRMAATier(year.age, year.irmaaSurcharge),
      };
    });
  }, [years, scenario, client]);

  // Filter conversion years (only years with conversions)
  const conversionYears = useMemo(() => {
    if (scenario !== "blueprint") return [];
    return computedData.filter((y) => y.conversionAmount > 0);
  }, [computedData, scenario]);

  // Get max bracket ceiling based on client settings
  const maxBracketCeiling = useMemo(() => {
    const maxRate = client.max_tax_rate ?? 24;
    return getBracketCeiling(client.filing_status, maxRate, new Date().getFullYear());
  }, [client]);

  // Get subtitle text based on scenario
  const getSubtitleText = () => {
    if (scenario === "baseline") {
      return "Annual projections assuming current trajectory and no Roth conversion.";
    }
    return "Annual projections assuming current trajectory with Roth conversion strategy applied.";
  };

  // Render table header cell
  const renderHeaderCell = (label: string, align: "left" | "right" = "right") => (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium text-slate-400 border-b border-slate-700 sticky top-0 bg-[#2d3548] z-10",
        align === "left" ? "text-left" : "text-right"
      )}
    >
      {label}
    </th>
  );

  // Render table data cell with optional styling
  const renderCell = (
    value: string | number,
    options: { align?: "left" | "right"; color?: "red" | "yellow" | "green" | "default" } = {}
  ) => {
    const { align = "right", color = "default" } = options;
    const colorClasses = {
      red: "text-red-400",
      yellow: "text-yellow-400",
      green: "text-emerald-400",
      default: "text-slate-200",
    };
    return (
      <td
        className={cn(
          "px-4 py-2.5 text-sm font-mono border-b border-slate-700/50",
          align === "left" ? "text-left" : "text-right",
          colorClasses[color]
        )}
      >
        {value}
      </td>
    );
  };

  // Render Account Values table
  const renderAccountValuesTable = () => (
    <table className="w-full border-collapse min-w-[1000px]">
      <thead>
        <tr>
          {renderHeaderCell("Year", "left")}
          {renderHeaderCell("Age", "left")}
          {renderHeaderCell("B.O.Y.")}
          {renderHeaderCell("Dist.(IRA)")}
          {renderHeaderCell("Taxes")}
          {renderHeaderCell("Bracket")}
          {renderHeaderCell("Converted")}
          {renderHeaderCell("Dist.(Roth)")}
          {renderHeaderCell("Interest")}
          {renderHeaderCell("E.O.Y.")}
        </tr>
      </thead>
      <tbody>
        {computedData.map((row, idx) => (
          <tr
            key={row.year}
            className={cn(
              "hover:bg-slate-700/30 transition-colors",
              idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]"
            )}
          >
            {renderCell(row.year, { align: "left" })}
            {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
            {renderCell(formatCurrency(row.boyCombined))}
            {renderCell(formatCurrency(row.distIra))}
            {renderCell(formatCurrency(row.totalTax), { color: "red" })}
            {renderCell(formatPercent(row.bracket))}
            {renderCell(formatCurrency(row.conversionAmount))}
            {renderCell("0")}
            {renderCell(formatCurrency(row.interest))}
            {renderCell(formatCurrency(row.eoyCombined))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Render Taxable Income table
  const renderTaxableIncomeTable = () => (
    <table className="w-full border-collapse min-w-[1000px]">
      <thead>
        <tr>
          {renderHeaderCell("Year", "left")}
          {renderHeaderCell("Age", "left")}
          {renderHeaderCell("SSI")}
          {renderHeaderCell("Taxable(Non-SSI)")}
          {renderHeaderCell("Exempt(Non-SSI)")}
          {renderHeaderCell("Dist.(IRA)")}
          {renderHeaderCell("AGI")}
          {renderHeaderCell("Deduc.")}
          {renderHeaderCell("Taxable Income")}
        </tr>
      </thead>
      <tbody>
        {computedData.map((row, idx) => (
          <tr
            key={row.year}
            className={cn(
              "hover:bg-slate-700/30 transition-colors",
              idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]"
            )}
          >
            {renderCell(row.year, { align: "left" })}
            {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
            {renderCell(formatCurrency(row.ssIncome))}
            {renderCell(formatCurrency(row.otherIncome))}
            {renderCell(formatCurrency(row.taxExemptNonSSI))}
            {renderCell(formatCurrency(row.distIra))}
            {renderCell(formatCurrency(row.agi), { color: "yellow" })}
            {renderCell(formatCurrency(row.deduction))}
            {renderCell(formatCurrency(row.taxableIncome))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Render IRMAA table
  const renderIRMAATable = () => (
    <table className="w-full border-collapse min-w-[900px]">
      <thead>
        <tr>
          {renderHeaderCell("Year", "left")}
          {renderHeaderCell("Age", "left")}
          {renderHeaderCell("AGI")}
          {renderHeaderCell("Tax Exempt")}
          {renderHeaderCell("MAGI")}
          {renderHeaderCell("Tier")}
          {renderHeaderCell("IRMAA")}
        </tr>
      </thead>
      <tbody>
        {computedData.map((row, idx) => (
          <tr
            key={row.year}
            className={cn(
              "hover:bg-slate-700/30 transition-colors",
              idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]"
            )}
          >
            {renderCell(row.year, { align: "left" })}
            {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
            {renderCell(formatCurrency(row.agi), { color: "yellow" })}
            {renderCell(formatCurrency(row.taxExemptNonSSI))}
            {renderCell(formatCurrency(row.magi))}
            {renderCell(row.irmaaTier)}
            {renderCell(formatCurrency(row.irmaaSurcharge), { color: "red" })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Render Net Income table
  const renderNetIncomeTable = () => (
    <table className="w-full border-collapse min-w-[1100px]">
      <thead>
        <tr>
          {renderHeaderCell("Year", "left")}
          {renderHeaderCell("Age", "left")}
          {renderHeaderCell("Taxable(Non-IRA)")}
          {renderHeaderCell("Tax Exempt")}
          {renderHeaderCell("Dist.(IRA)")}
          {renderHeaderCell("Dist.(Roth)")}
          {renderHeaderCell("Taxes")}
          {renderHeaderCell("IRMAA")}
          {renderHeaderCell("Converted")}
          {renderHeaderCell("Net Income")}
        </tr>
      </thead>
      <tbody>
        {computedData.map((row, idx) => (
          <tr
            key={row.year}
            className={cn(
              "hover:bg-slate-700/30 transition-colors",
              idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]"
            )}
          >
            {renderCell(row.year, { align: "left" })}
            {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
            {renderCell(formatCurrency(row.otherIncome))}
            {renderCell(formatCurrency(row.taxExemptNonSSI))}
            {renderCell(formatCurrency(row.distIra))}
            {renderCell("0")}
            {renderCell(formatCurrency(row.totalTax), { color: "red" })}
            {renderCell(formatCurrency(row.irmaaSurcharge), { color: "red" })}
            {renderCell(formatCurrency(row.conversionAmount))}
            {renderCell(formatCurrency(row.netIncome), { color: "green" })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Render Conversion Details table (Blueprint only)
  const renderConversionDetailsTable = () => (
    <table className="w-full border-collapse min-w-[1100px]">
      <thead>
        <tr>
          {renderHeaderCell("Age", "left")}
          {renderHeaderCell("Income(Taxable)")}
          {renderHeaderCell("Dist.(IRA)")}
          {renderHeaderCell(`Max Bracket(${client.max_tax_rate ?? 24}%)`)}
          {renderHeaderCell("Taxes")}
          {renderHeaderCell("Conversion Amt")}
          {renderHeaderCell("Interest")}
          {renderHeaderCell("E.O.Y.(IRA)")}
          {renderHeaderCell("E.O.Y.(Roth)")}
        </tr>
      </thead>
      <tbody>
        {conversionYears.length === 0 ? (
          <tr className="bg-[#1a1f2e]">
            <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
              No conversions in this projection.
            </td>
          </tr>
        ) : (
          conversionYears.map((row, idx) => (
            <tr
              key={row.year}
              className={cn(
                "hover:bg-slate-700/30 transition-colors",
                idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]"
              )}
            >
              {renderCell(row.age, { align: "left" })}
              {renderCell(formatCurrency(row.taxableIncome))}
              {renderCell(formatCurrency(row.conversionAmount))}
              {renderCell(formatCurrency(maxBracketCeiling))}
              {renderCell(formatCurrency(row.totalTax), { color: "red" })}
              {renderCell(formatCurrency(row.conversionAmount))}
              {renderCell(formatCurrency(row.interest))}
              {renderCell(formatCurrency(row.traditionalBalance))}
              {renderCell(formatCurrency(row.rothBalance))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  // Render the appropriate table based on active tab
  const renderTable = () => {
    switch (activeTab) {
      case "account":
        return renderAccountValuesTable();
      case "taxable":
        return renderTaxableIncomeTable();
      case "irmaa":
        return renderIRMAATable();
      case "netIncome":
        return renderNetIncomeTable();
      case "conversion":
        return renderConversionDetailsTable();
      default:
        return null;
    }
  };

  // Filter tabs based on scenario
  const visibleTabs = TABS.filter((tab) => tab.showAlways || scenario === "blueprint");

  return (
    <div className="bg-[#1a1f2e] rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100 mb-3">Year-over-Year Values</h3>

        {/* Scenario Toggle */}
        <div className="flex items-center gap-6 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scenario"
              value="baseline"
              checked={scenario === "baseline"}
              onChange={() => setScenario("baseline")}
              className="w-4 h-4 text-blue-500 bg-slate-700 border-slate-600 focus:ring-blue-500"
            />
            <span
              className={cn(
                "text-sm font-medium",
                scenario === "baseline" ? "text-slate-100" : "text-slate-400"
              )}
            >
              Baseline
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scenario"
              value="blueprint"
              checked={scenario === "blueprint"}
              onChange={() => setScenario("blueprint")}
              className="w-4 h-4 text-teal-500 bg-slate-700 border-slate-600 focus:ring-teal-500"
            />
            <span
              className={cn(
                "text-sm font-medium",
                scenario === "blueprint" ? "text-teal-400" : "text-slate-400"
              )}
            >
              Blueprint
            </span>
          </label>
        </div>

        {/* Subtitle */}
        <p className="text-sm text-slate-400">{getSubtitleText()}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-700 bg-[#0f172a]">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-5 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">{renderTable()}</div>

      {/* Footer Disclaimer */}
      <div className="px-6 py-4 border-t border-slate-700 bg-[#0f172a]">
        <p className="text-xs text-slate-500 italic">
          This optimized plan is for educational purposes only. Before making a Roth conversion,
          discuss your final plan with a tax professional.
        </p>
      </div>
    </div>
  );
}
