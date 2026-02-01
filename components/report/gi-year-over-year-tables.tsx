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
  blueprintYears: YearlyResult[];
  giYearlyData: GIYearlyData[];
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
  blueprintYears,
  giYearlyData,
  client,
}: GIYearOverYearTablesProps) {
  const [scenario, setScenario] = useState<Scenario>("blueprint");
  const [activeTab, setActiveTab] = useState<TabId>("account");

  useEffect(() => {
    if (scenario === "baseline" && activeTab === "conversion") {
      setActiveTab("account");
    }
  }, [scenario, activeTab]);

  const years = scenario === "baseline" ? baselineYears : blueprintYears;

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

      // For blueprint scenario, use GI data for BOY account value
      const giYear = scenario === "blueprint" ? giDataMap.get(index) : undefined;

      // B.O.Y. values
      const boyTraditional = prevYear
        ? prevYear.traditionalBalance
        : scenario === "blueprint"
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
      const grossIncome = scenario === "blueprint" && giYear?.phase === 'income'
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
      const netIncome = scenario === "blueprint"
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
    if (scenario !== "blueprint") return [];
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
        "px-4 py-3 text-xs font-medium text-slate-400 border-b border-slate-700 sticky top-0 bg-[#2d3548] z-10",
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
      green: "text-emerald-400",
      default: "text-slate-200",
    };
    return (
      <td
        className={cn(
          "px-4 py-2.5 text-sm font-mono border-b border-slate-700/50",
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
                  "hover:bg-slate-700/30 transition-colors",
                  idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]"
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

    // Blueprint: GI-specific columns
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
                "hover:bg-slate-700/30 transition-colors",
                idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]",
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
                "px-4 py-2.5 text-sm font-mono border-b border-slate-700/50 text-center",
                row.accountDepleted ? "text-red-400" : "text-slate-600"
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
          {renderHeaderCell(scenario === "blueprint" ? "GI Payment" : "Dist.(IRA)")}
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
              idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]",
              scenario === "blueprint" && row.accountDepleted && "bg-red-950/20"
            )}
          >
            {renderCell(row.year, { align: "left" })}
            {renderCell(formatAge(row.age, row.spouseAge), { align: "left" })}
            {renderCell(formatCurrency(row.ssIncome))}
            {renderCell(formatCurrency(row.otherIncome))}
            {renderCell(formatCurrency(row.taxExemptNonSSI))}
            {renderCell(formatCurrency(
              scenario === "blueprint"
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
                  "hover:bg-slate-700/30 transition-colors",
                  idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]"
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

    // Blueprint: GI-specific net income
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
                "hover:bg-slate-700/30 transition-colors",
                idx % 2 === 0 ? "bg-[#1a1f2e]" : "bg-[#242938]",
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
          <tr className="bg-[#1a1f2e]">
            <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
              No conversions in this projection (income starts immediately).
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
              name="gi-scenario"
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
              name="gi-scenario"
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

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-700 bg-[#0f172a]">
        {scenario === "blueprint" && hasDepletedRows && (
          <p className="text-xs text-amber-400 mb-2">
            Shaded rows indicate account value has been depleted. Guaranteed income payments continue per the contract terms.
          </p>
        )}
        <p className="text-xs text-slate-500 italic">
          This optimized plan is for educational purposes only. Before making a Roth conversion,
          discuss your final plan with a tax professional.
        </p>
      </div>
    </div>
  );
}
