"use client";

import { useState, useEffect, useMemo } from "react";
import { YearlyResult } from "@/lib/calculations/types";
import { cn } from "@/lib/utils";
import { Client } from "@/lib/types/client";
import { GIYearlyData } from "@/lib/types/projection";
import { getStandardDeduction } from "@/lib/data/standard-deductions";
import { getBracketCeiling } from "@/lib/data/federal-brackets-2026";

interface GIYearOverYearTablesProps {
  baselineYears: YearlyResult[];
  formulaYears: YearlyResult[];
  giYearlyData: GIYearlyData[];
  client: Client;
}

type Scenario = "baseline" | "formula";
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

const formatCurrency = (value: number): string => {
  if (value === 0) return "0";
  const dollars = value / 100;
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
};

const formatAge = (primaryAge: number, spouseAge: number | null): string => {
  if (spouseAge !== null && spouseAge > 0) {
    return `${primaryAge} / ${spouseAge}`;
  }
  return primaryAge.toString();
};

const getIRMAATier = (age: number, irmaaSurcharge: number): string => {
  if (age < 65) return "Pre-IRMAA";
  if (irmaaSurcharge === 0) return "Tier 1";
  const annualSurcharge = irmaaSurcharge / 100;
  if (annualSurcharge < 1000) return "Tier 1";
  if (annualSurcharge < 2500) return "Tier 2";
  if (annualSurcharge < 4000) return "Tier 3";
  if (annualSurcharge < 5500) return "Tier 4";
  if (annualSurcharge < 7000) return "Tier 5";
  return "Tier 6";
};

export function GIYearOverYearTables({
  baselineYears,
  formulaYears,
  giYearlyData,
  client,
}: GIYearOverYearTablesProps) {
  const [scenario, setScenario] = useState<Scenario>("formula");
  const [activeTab, setActiveTab] = useState<TabId>("account");

  useEffect(() => {
    if (scenario === "baseline" && activeTab === "conversion") {
      setActiveTab("account");
    }
  }, [scenario, activeTab]);

  const years = scenario === "baseline" ? baselineYears : formulaYears;

  // Build a map from year index to GI data for quick lookup
  const giDataMap = useMemo(() => {
    const map = new Map<number, GIYearlyData>();
    giYearlyData.forEach((giYear, index) => {
      map.set(index, giYear);
    });
    return map;
  }, [giYearlyData]);

  const computedData = useMemo(() => {
    return years.map((year, index) => {
      const prevYear = index > 0 ? years[index - 1] : null;

      // For formula scenario, use GI data for BOY account value
      const giYear = scenario === "formula" ? giDataMap.get(index) : undefined;

      // B.O.Y. values
      const boyTraditional = prevYear
        ? prevYear.traditionalBalance
        : scenario === "formula"
          ? Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 10) / 100))
          : (client.qualified_account_value ?? 0);
      const boyRoth = prevYear ? prevYear.rothBalance : (client.roth_ira ?? 0);

      // GI-specific: get income base and GI payment from gi_yearly_data
      const incomeBase = giYear?.incomeBase ?? 0;
      const giPaymentGross = giYear?.guaranteedIncomeGross ?? 0;
      const giPaymentNet = giYear?.guaranteedIncomeNet ?? 0;
      const taxOnGI = giPaymentGross - giPaymentNet;
      const accountDepleted = giYear ? giYear.accountValue === 0 && giYear.phase === 'income' : false;

      // For baseline, the "GI payment" column shows baseline withdrawal (rmdAmount)
      const distIra = scenario === "baseline" ? year.rmdAmount : year.conversionAmount;

      // AGI calculation
      const grossIncome = scenario === "formula" && giYear?.phase === 'income'
        ? giPaymentGross + year.otherIncome
        : year.otherIncome + distIra;
      const agi = grossIncome;

      const deduction = getStandardDeduction(
        client.filing_status,
        year.age,
        year.spouseAge ?? undefined,
        year.year
      );
      const taxableIncome = Math.max(0, agi - deduction);
      const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;
      const magi = agi + taxExemptNonSSI + year.ssIncome;

      // Net income for GI
      const netIncome = scenario === "formula"
        ? year.otherIncome + taxExemptNonSSI + year.ssIncome + giPaymentNet - year.irmaaSurcharge
        : year.otherIncome + taxExemptNonSSI + year.ssIncome + year.rmdAmount - year.totalTax - year.irmaaSurcharge;

      return {
        ...year,
        boyTraditional,
        boyRoth,
        incomeBase,
        giPaymentGross,
        giPaymentNet,
        taxOnGI,
        accountDepleted,
        distIra,
        agi,
        deduction,
        taxableIncome,
        taxExemptNonSSI,
        magi,
        netIncome,
        irmaaTier: getIRMAATier(year.age, year.irmaaSurcharge),
        giPhase: giYear?.phase ?? 'income',
      };
    });
  }, [years, scenario, client, giDataMap]);

  // Conversion years: only deferral phase with conversions
  const conversionYears = useMemo(() => {
    if (scenario !== "formula") return [];
    return computedData.filter((y) => y.conversionAmount > 0);
  }, [computedData, scenario]);

  const hasDepletedRows = computedData.some(y => y.accountDepleted);

  const maxBracketCeiling = useMemo(() => {
    const maxRate = client.max_tax_rate ?? 24;
    return getBracketCeiling(client.filing_status, maxRate, new Date().getFullYear());
  }, [client]);

  const getSubtitleText = () => {
    if (scenario === "baseline") {
      return "Annual projections assuming current trajectory with systematic withdrawals matching guaranteed income amount.";
    }
    return "Annual projections with Roth conversion strategy and guaranteed income payments.";
  };

  const renderHeaderCell = (label: string, align: "left" | "right" = "right") => (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium text-[#A0A0A0] border-b border-[#2A2A2A] sticky top-0 bg-[#1F1F1F] z-10",
        align === "left" ? "text-left" : "text-right"
      )}
    >
      {label}
    </th>
  );

  const renderCell = (
    value: string | number,
    options: { align?: "left" | "right"; color?: "red" | "yellow" | "green" | "default"; className?: string } = {}
  ) => {
    const { align = "right", color = "default", className: extraClass } = options;
    const colorClasses = {
      red: "text-red-400",
      yellow: "text-yellow-400",
      green: "text-[#22C55E]",
      default: "text-white",
    };
    return (
      <td
        className={cn(
          "px-4 py-2.5 text-sm font-mono border-b border-[#1F1F1F]",
          align === "left" ? "text-left" : "text-right",
          colorClasses[color],
          extraClass
        )}
      >
        {value}
      </td>
    );
  };

  // ---- GI Account Values Table ----
  const renderAccountValuesTable = () => {
    if (scenario === "baseline") {
      // Baseline: simpler table (no GI-specific columns)
      return (
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr>
              {renderHeaderCell("Year", "left")}
              {renderHeaderCell("Age", "left")}
              {renderHeaderCell("B.O.Y.")}
              {renderHeaderCell("Withdrawal")}
              {renderHeaderCell("Taxes")}
              {renderHeaderCell("E.O.Y.")}
              {renderHeaderCell("Roth Bal")}
            </tr>
          </thead>
          <tbody>
            {computedData.map((row, idx) => (
              <tr
                key={row.year}
                className={cn(
                  "hover:bg-[#1F1F1F]/30 transition-colors",
                  idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-[#141414]"
                )}
              >
                {renderCell(row.year, { align: "left" })}
                {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
                {renderCell(formatCurrency(row.boyTraditional))}
                {renderCell(formatCurrency(row.rmdAmount))}
                {renderCell(formatCurrency(row.totalTax), { color: "red" })}
                {renderCell(formatCurrency(row.traditionalBalance))}
                {renderCell(formatCurrency(row.rothBalance))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // Formula: GI-specific columns
    return (
      <table className="w-full border-collapse min-w-[1100px]">
        <thead>
          <tr>
            {renderHeaderCell("Year", "left")}
            {renderHeaderCell("Age", "left")}
            {renderHeaderCell("Acct Val BOY")}
            {renderHeaderCell("Income Base")}
            {renderHeaderCell("GI Payment")}
            {renderHeaderCell("Tax on GI")}
            {renderHeaderCell("Acct Val EOY")}
            {renderHeaderCell("Roth Bal")}
            {renderHeaderCell("Depleted")}
          </tr>
        </thead>
        <tbody>
          {computedData.map((row, idx) => (
            <tr
              key={row.year}
              className={cn(
                "hover:bg-[#1F1F1F]/30 transition-colors",
                idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-[#141414]",
                row.accountDepleted && "bg-red-950/20"
              )}
            >
              {renderCell(row.year, { align: "left" })}
              {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
              {renderCell(formatCurrency(row.boyTraditional))}
              {renderCell(formatCurrency(row.incomeBase))}
              {renderCell(
                formatCurrency(row.giPaymentGross),
                { color: row.accountDepleted ? "green" : "default", className: row.accountDepleted ? "font-semibold" : "" }
              )}
              {renderCell(formatCurrency(row.taxOnGI), { color: "red" })}
              {renderCell(formatCurrency(row.traditionalBalance))}
              {renderCell(formatCurrency(row.rothBalance))}
              <td className={cn(
                "px-4 py-2.5 text-sm font-mono border-b border-[#1F1F1F] text-center",
                row.accountDepleted ? "text-red-400" : "text-[#6B6B6B]"
              )}>
                {row.accountDepleted ? "\u2713" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ---- GI Taxable Income Table ----
  const renderTaxableIncomeTable = () => (
    <table className="w-full border-collapse min-w-[1000px]">
      <thead>
        <tr>
          {renderHeaderCell("Year", "left")}
          {renderHeaderCell("Age", "left")}
          {renderHeaderCell("SSI")}
          {renderHeaderCell("Taxable(Non-SSI)")}
          {renderHeaderCell("Exempt(Non-SSI)")}
          {renderHeaderCell(scenario === "formula" ? "GI Payment" : "Dist.(IRA)")}
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
              "hover:bg-[#1F1F1F]/30 transition-colors",
              idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-[#141414]",
              scenario === "formula" && row.accountDepleted && "bg-red-950/20"
            )}
          >
            {renderCell(row.year, { align: "left" })}
            {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
            {renderCell(formatCurrency(row.ssIncome))}
            {renderCell(formatCurrency(row.otherIncome))}
            {renderCell(formatCurrency(row.taxExemptNonSSI))}
            {renderCell(formatCurrency(
              scenario === "formula"
                ? (row.giPhase === 'income' ? row.giPaymentGross : row.conversionAmount)
                : row.distIra
            ))}
            {renderCell(formatCurrency(row.agi), { color: "yellow" })}
            {renderCell(formatCurrency(row.deduction))}
            {renderCell(formatCurrency(row.taxableIncome))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // ---- IRMAA Table (same structure as Growth) ----
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
              "hover:bg-[#1F1F1F]/30 transition-colors",
              idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-[#141414]"
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

  // ---- GI Net Income Table ----
  const renderNetIncomeTable = () => {
    if (scenario === "baseline") {
      // Baseline: standard net income table
      return (
        <table className="w-full border-collapse min-w-[1000px]">
          <thead>
            <tr>
              {renderHeaderCell("Year", "left")}
              {renderHeaderCell("Age", "left")}
              {renderHeaderCell("Taxable(Non-IRA)")}
              {renderHeaderCell("Tax Exempt")}
              {renderHeaderCell("Dist.(IRA)")}
              {renderHeaderCell("Taxes")}
              {renderHeaderCell("IRMAA")}
              {renderHeaderCell("Net Income")}
            </tr>
          </thead>
          <tbody>
            {computedData.map((row, idx) => (
              <tr
                key={row.year}
                className={cn(
                  "hover:bg-[#1F1F1F]/30 transition-colors",
                  idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-[#141414]"
                )}
              >
                {renderCell(row.year, { align: "left" })}
                {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
                {renderCell(formatCurrency(row.otherIncome))}
                {renderCell(formatCurrency(row.taxExemptNonSSI))}
                {renderCell(formatCurrency(row.rmdAmount))}
                {renderCell(formatCurrency(row.totalTax), { color: "red" })}
                {renderCell(formatCurrency(row.irmaaSurcharge), { color: "red" })}
                {renderCell(formatCurrency(row.netIncome), { color: "green" })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // Formula: GI-specific net income
    return (
      <table className="w-full border-collapse min-w-[1100px]">
        <thead>
          <tr>
            {renderHeaderCell("Year", "left")}
            {renderHeaderCell("Age", "left")}
            {renderHeaderCell("Taxable(Non-GI)")}
            {renderHeaderCell("Tax Exempt")}
            {renderHeaderCell("GI Payment(Gross)")}
            {renderHeaderCell("GI Payment(Net)")}
            {renderHeaderCell("Taxes")}
            {renderHeaderCell("IRMAA")}
            {renderHeaderCell("Net Income")}
          </tr>
        </thead>
        <tbody>
          {computedData.map((row, idx) => (
            <tr
              key={row.year}
              className={cn(
                "hover:bg-[#1F1F1F]/30 transition-colors",
                idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-[#141414]",
                row.accountDepleted && "bg-red-950/20"
              )}
            >
              {renderCell(row.year, { align: "left" })}
              {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
              {renderCell(formatCurrency(row.otherIncome))}
              {renderCell(formatCurrency(row.taxExemptNonSSI))}
              {renderCell(
                formatCurrency(row.giPaymentGross),
                { color: row.accountDepleted ? "green" : "default", className: row.accountDepleted ? "font-semibold" : "" }
              )}
              {renderCell(
                formatCurrency(row.giPaymentNet),
                { color: "green", className: row.accountDepleted ? "font-semibold" : "" }
              )}
              {renderCell(formatCurrency(row.totalTax), { color: "red" })}
              {renderCell(formatCurrency(row.irmaaSurcharge), { color: "red" })}
              {renderCell(formatCurrency(row.netIncome), { color: "green" })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // ---- Conversion Details Table (same as Growth, limited to deferral) ----
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
          {renderHeaderCell("E.O.Y.(IRA)")}
          {renderHeaderCell("E.O.Y.(Roth)")}
        </tr>
      </thead>
      <tbody>
        {conversionYears.length === 0 ? (
          <tr className="bg-[#141414]">
            <td colSpan={8} className="px-4 py-8 text-center text-[#A0A0A0]">
              No conversions in this projection (income starts immediately).
            </td>
          </tr>
        ) : (
          conversionYears.map((row, idx) => (
            <tr
              key={row.year}
              className={cn(
                "hover:bg-[#1F1F1F]/30 transition-colors",
                idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-[#141414]"
              )}
            >
              {renderCell(row.age, { align: "left" })}
              {renderCell(formatCurrency(row.taxableIncome))}
              {renderCell(formatCurrency(row.conversionAmount))}
              {renderCell(formatCurrency(maxBracketCeiling))}
              {renderCell(formatCurrency(row.totalTax), { color: "red" })}
              {renderCell(formatCurrency(row.conversionAmount))}
              {renderCell(formatCurrency(row.traditionalBalance))}
              {renderCell(formatCurrency(row.rothBalance))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

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

  const visibleTabs = TABS.filter((tab) => tab.showAlways || scenario === "formula");

  return (
    <div className="bg-[#141414] rounded-lg border border-[#2A2A2A] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#2A2A2A]">
        <h3 className="text-lg font-semibold text-white mb-3">Year-over-Year Values</h3>

        {/* Scenario Toggle */}
        <div className="flex items-center gap-6 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gi-scenario"
              value="baseline"
              checked={scenario === "baseline"}
              onChange={() => setScenario("baseline")}
              className="w-4 h-4 text-[#F5B800] bg-[#1F1F1F] border-[#2A2A2A] focus:ring-[#F5B800]"
            />
            <span
              className={cn(
                "text-sm font-medium",
                scenario === "baseline" ? "text-white" : "text-[#A0A0A0]"
              )}
            >
              Baseline
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gi-scenario"
              value="formula"
              checked={scenario === "formula"}
              onChange={() => setScenario("formula")}
              className="w-4 h-4 text-[#F5B800] bg-[#1F1F1F] border-[#2A2A2A] focus:ring-[#F5B800]"
            />
            <span
              className={cn(
                "text-sm font-medium",
                scenario === "formula" ? "text-[#F5B800]" : "text-[#A0A0A0]"
              )}
            >
              Formula
            </span>
          </label>
        </div>

        <p className="text-sm text-[#A0A0A0]">{getSubtitleText()}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-[#2A2A2A] bg-[#141414]">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-5 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-[#F5B800] text-black font-semibold"
                : "text-[#A0A0A0] hover:text-white hover:bg-[#141414]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">{renderTable()}</div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#2A2A2A] bg-[#141414]">
        {scenario === "formula" && hasDepletedRows && (
          <p className="text-xs text-[#F5B800] mb-2">
            Shaded rows indicate account value has been depleted. Guaranteed income payments continue per the contract terms.
          </p>
        )}
        <p className="text-xs text-[#6B6B6B] italic">
          This optimized plan is for educational purposes only. Before making a Roth conversion,
          discuss your final plan with a tax professional.
        </p>
      </div>
    </div>
  );
}
