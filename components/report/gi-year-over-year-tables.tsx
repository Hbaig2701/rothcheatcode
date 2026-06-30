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
  // Infinity = top federal bracket has no ceiling. Render em-dash so the
  // "Max Bracket(37%)" column doesn't show "$∞" — same fix as the growth
  // tables and the PDF formatter (Jorge Tola report bug).
  if (!Number.isFinite(value)) return "—";
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

const getIRMAATier = (age: number, tier: number | null | undefined): string => {
  if (age < 65) return "Pre-IRMAA";
  // Use the engine's irmaaTier (0 = Standard / below the first IRMAA threshold,
  // 1-5 = surcharge tiers) rather than re-deriving the tier from the surcharge
  // dollar amount. The old version returned "Tier 1" for a $0 surcharge —
  // labeling every 65+ client who is NOT in IRMAA as "Tier 1" — and used
  // single-filer dollar bands that misclassified joint filers (audit F12).
  if (tier == null || tier <= 0) return "Standard";
  return `Tier ${tier}`;
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

      // AGI / deduction / taxable income / MAGI — read the engine's own per-year
      // fields (single source of truth) rather than re-deriving them here. The
      // previous derivation set agi = otherIncome + distIra and, in the strategy
      // income phase, added the GROSS GI payment. That (a) omitted taxable Social
      // Security in the conversion/baseline phases, and (b) counted the TAX-FREE
      // Roth-owned GI payment as taxable income during the income phase — which
      // also overstated MAGI and could surface a too-high IRMAA tier. The engine
      // reports agi/taxableIncome = $0 during the tax-free GI income years
      // (correct); the gross payment is still shown in the GI Payment column.
      // Falls back to the old derivation only if a field is somehow absent.
      // (audit F2-GI.)
      const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;
      const deduction = year.standardDeduction ?? getStandardDeduction(
        client.filing_status,
        year.age,
        year.spouseAge ?? undefined,
        year.year
      );
      const giIncomePhase = scenario === "formula" && giYear?.phase === 'income';
      const agi = year.agi ?? (giIncomePhase ? giPaymentGross + year.otherIncome : year.otherIncome + distIra);
      const taxableIncome = year.taxableIncome ?? Math.max(0, agi - deduction);
      const magi = year.magi ?? (agi + taxExemptNonSSI + year.ssIncome);

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
        irmaaTier: getIRMAATier(year.age, year.irmaaTier),
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
    // Mirror the GI engine's conversion bracket EXACTLY (engine.ts:
    // `gi_conversion_bracket ?? max_tax_rate ?? 24`) so this table's ceiling
    // and headroom always match what the engine actually converted to. Using
    // max_tax_rate here would diverge whenever the two fields differed.
    const maxRate = client.gi_conversion_bracket ?? client.max_tax_rate ?? 24;
    return getBracketCeiling(client.filing_status, maxRate, new Date().getFullYear());
  }, [client]);

  const isNoConversion = client.conversion_type === 'no_conversion';
  const getSubtitleText = () => {
    if (scenario === "baseline") {
      return "Annual projections assuming current trajectory with systematic withdrawals matching guaranteed income amount.";
    }
    if (isNoConversion) {
      return "Annual projections — no Roth conversion configured. Guaranteed income payments shown without a conversion overlay.";
    }
    return "Annual projections with Roth conversion strategy and guaranteed income payments.";
  };

  const renderHeaderCell = (label: string, align: "left" | "right" = "right") => (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium text-[#A0A0A0] border-b border-border-default sticky top-0 bg-[#1F1F1F] z-10",
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
      default: "text-foreground",
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
                  idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-surface"
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
                idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-surface",
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
              idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-surface",
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
              idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-surface"
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
                  idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-surface"
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
                idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-surface",
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
          {renderHeaderCell(`Conv. Bracket(${client.gi_conversion_bracket ?? client.max_tax_rate ?? 24}%)`)}
          {renderHeaderCell("Taxes")}
          {renderHeaderCell("Conversion Amt")}
          {renderHeaderCell("E.O.Y.(IRA)")}
          {renderHeaderCell("E.O.Y.(Roth)")}
        </tr>
      </thead>
      <tbody>
        {conversionYears.length === 0 ? (
          <tr className="bg-surface">
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
                idx % 2 === 0 ? "bg-[#0A0A0A]" : "bg-surface"
              )}
            >
              {renderCell(row.age, { align: "left" })}
              {renderCell(formatCurrency(row.taxableIncome))}
              {renderCell(formatCurrency(row.conversionAmount))}
              {renderCell(formatCurrency(maxBracketCeiling))}
              {/* Show only the tax attributable to the conversion, not the year's
                  full tax bill (which would include tax on SS, NQ, etc.) */}
              {renderCell(
                formatCurrency((row.federalTaxOnConversions ?? 0) + (row.stateTaxOnConversions ?? 0)),
                { color: "red" }
              )}
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
    <div className="bg-surface rounded-lg border border-border-default overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-default">
        <h3 className="text-lg font-semibold text-foreground mb-3">Year-over-Year Values</h3>

        {/* Scenario Toggle */}
        <div className="flex items-center gap-6 mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="gi-scenario"
              value="baseline"
              checked={scenario === "baseline"}
              onChange={() => setScenario("baseline")}
              className="w-4 h-4 text-[#F5B800] bg-[#1F1F1F] border-border-default focus:ring-[#F5B800]"
            />
            <span
              className={cn(
                "text-sm font-medium",
                scenario === "baseline" ? "text-foreground" : "text-[#A0A0A0]"
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
              className="w-4 h-4 text-[#F5B800] bg-[#1F1F1F] border-border-default focus:ring-[#F5B800]"
            />
            <span
              className={cn(
                "text-sm font-medium",
                scenario === "formula" ? "text-[#F5B800]" : "text-[#A0A0A0]"
              )}
            >
              Strategy
            </span>
          </label>
        </div>

        <p className="text-sm text-[#A0A0A0]">{getSubtitleText()}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border-default bg-surface">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-5 py-3 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-[#F5B800] text-black font-semibold"
                : "text-[#A0A0A0] hover:text-foreground hover:bg-surface"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">{renderTable()}</div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border-default bg-surface">
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
