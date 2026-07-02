import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVisibleUserIds } from '@/lib/auth/visibleUserIds';
import { isGuaranteedIncomeProduct, type FormulaType } from '@/lib/config/products';
import { checkUsageLimit, incrementUsage, getEffectivePlan } from '@/lib/usage';
import { hasFeature, hasFullAccess } from '@/lib/config/plans';
import { determineTaxBracket, calculateFederalTax } from '@/lib/calculations/modules/federal-tax';
import { computeMarginalRMDTax } from '@/lib/calculations/marginal-rmd-tax';
import { calculateStateTax } from '@/lib/calculations/modules/state-tax';
import { computeTaxableIncomeWithSS } from '@/lib/calculations/tax-helpers';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getClientRMDStartAge } from '@/lib/calculations/utils/age';
import { getBracketCeiling } from '@/lib/data/federal-brackets-2026';
import { getTaxExemptIncomeForYear } from '@/lib/calculations/utils/income';
import { getCustomProduct } from '@/lib/products/repository';
import { getEffectiveGrowthRiderFee, getEffectiveGIData } from '@/lib/calculations/resolvers/product-resolver';
import type { CustomProductRow } from '@/lib/products/types';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for PDF generation

// Register Handlebars helpers
Handlebars.registerHelper('formatCurrency', (value: number) => {
  if (value === 0) return '$0';
  return '$' + new Intl.NumberFormat('en-US').format(Math.round(value));
});

// Helper to generate page header with branding logo/company name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper('pageHeader', function(this: any, title: string) {
  const branding = this.branding;
  let leftHtml = '';
  if (branding?.logoUrl) {
    leftHtml = `<img class="header-logo" src="${Handlebars.Utils.escapeExpression(branding.logoUrl)}" alt="" />`;
  } else if (branding?.companyName) {
    leftHtml = `<span class="header-company">${Handlebars.Utils.escapeExpression(branding.companyName)}</span>`;
  } else {
    leftHtml = '<span></span>';
  }
  return new Handlebars.SafeString(
    `<div class="page-branding-header">${leftHtml}<span class="header-title">${Handlebars.Utils.escapeExpression(title)}</span></div>`
  );
});

// Helper to generate page footer with branding contact info
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Handlebars.registerHelper('brandingFooter', function(this: any) {
  const branding = this.branding;
  if (!branding) return '';
  const parts: string[] = [];
  if (branding.companyName) parts.push(Handlebars.Utils.escapeExpression(branding.companyName));
  if (branding.phone) parts.push(Handlebars.Utils.escapeExpression(branding.phone));
  if (branding.email) parts.push(Handlebars.Utils.escapeExpression(branding.email));
  if (branding.website) parts.push(Handlebars.Utils.escapeExpression(branding.website));
  if (parts.length === 0) return '';
  return new Handlebars.SafeString(
    `<div class="page-branding-footer">${parts.join(' &middot; ')}</div>`
  );
});

// Helper to format difference values with color class (no +/- signs)
Handlebars.registerHelper('formatDiff', function(value: number, invertColor: boolean = false) {
  if (value === 0) return new Handlebars.SafeString('<span class="diff-neutral">$0</span>');
  const absValue = Math.abs(value);
  const formatted = '$' + new Intl.NumberFormat('en-US').format(Math.round(absValue));
  // For costs/taxes, negative is good (green), positive is bad (red)
  // For wealth/legacy, positive is good (green), negative is bad (red)
  let colorClass: string;
  if (invertColor) {
    colorClass = value <= 0 ? 'diff-positive' : 'diff-negative';
  } else {
    colorClass = value >= 0 ? 'diff-positive' : 'diff-negative';
  }
  return new Handlebars.SafeString(`<span class="${colorClass}">${formatted}</span>`);
});

interface YearRow {
  year: number;
  age: number;
  spouseAge?: number | null;
  boyCombined: string;
  distIra: string;
  taxesIra: string;
  bracket: string;
  converted: string;
  distRoth: string;
  interest: string;
  eoyCombined: string;
  ssi: string;
  taxableSs: string;
  taxableNonSsi: string;
  exemptNonSsi: string;
  agi: string;
  deduction: string;
  taxableIncome: string;
  taxExempt: string;
  magi: string;
  tier: string;
  irmaaTotal: string;
  taxableNonIra: string;
  taxExemptNonIra: string;
  taxesTotal: string;
  netIncome: string;
  riderFeeAmount: string;
}

interface ConversionDetail {
  age: number;
  existingTaxable: string;
  distribution: string;
  bracketCeiling: string;
  taxes: string;
  conversionAmount: string;
  interest: string;
  eoyIra: string;
  eoyRoth: string;
}

// Totals rows — only sum flow-type columns (distributions, taxes, growth);
// balances and rates are intentionally omitted since summing them is meaningless.
interface AccountValuesTotalsRow {
  distIra: string;
  taxesIra: string;
  riderFeeAmount: string;
  converted: string;
  distRoth: string;
  interest: string;
}

interface TaxableIncomeTotalsRow {
  ssi: string;
  taxableSs: string;
  taxableNonSsi: string;
  exemptNonSsi: string;
  distIra: string;
  agi: string;
  deduction: string;
  taxableIncome: string;
  netIncome: string;
}

interface ConversionDetailsTotalsRow {
  existingTaxable: string;
  distribution: string;
  taxes: string;
  conversionAmount: string;
  interest: string;
}

interface RothGrowthTotalsRow {
  annualGrowth: string;
}

interface ConversionPaybackTotalsRow {
  conversionAmount: string;
  taxPaid: string;
}

interface RMDAvoidanceTotalsRow {
  baselineRMD: string;
  strategyRMD: string;
  rmdAvoided: string;
  taxSaved: string;
}

interface ScenarioData {
  totalDistributions: string;
  totalConversions: string;
  // Conversion-attributable tax only — federalTaxOnConversions + stateTaxOnConversions
  // summed across years. For baseline this is $0 (no conversions). Matches the
  // year-by-year Conversion Details and Conversion Cost & Payback tables.
  taxOnConversionsOnly: string;
  // RMD-attributable tax only — for each year with an RMD, the marginal tax owed
  // because of the RMD itself (recomputed by re-running the tax engine without
  // the RMD and taking the difference). Excludes background tax on W-2/SS that
  // the client would pay anyway. Strategy is typically $0 since conversions
  // eliminate RMDs.
  taxOnRMDsOnly: string;
  premiumBonusReceived: string;
  netTaxCost: string;
  afterTaxDistributions: string;
  legacyGross: string;
  legacyTax: string;
  legacyNet: string;
  totalDist: string;
  totalCosts: string;
  lifetimeWealth: string;
  accountValues: YearRow[];
  taxableIncome: YearRow[];
  irmaa: YearRow[];
  netIncome: YearRow[];
  accountValuesTotals: AccountValuesTotalsRow;
  taxableIncomeTotals: TaxableIncomeTotalsRow;
}

interface BrandingData {
  companyName: string;
  tagline: string;
  logoUrl: string;
  logoLightUrl: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
  secondaryColor: string;
  hasBranding: boolean;
  hasContactInfo: boolean;
}

interface RothGrowthRow {
  year: number;
  age: number;
  rothBalance: string;
  annualGrowth: string;
  cumulativeGrowth: string;
}

interface ConversionPaybackRow {
  year: number;
  age: number;
  conversionAmount: string;
  taxPaid: string;
  cumulativeTaxPaid: string;
  rothValueGained: string;
}

interface LegacyComparisonRow {
  year: number;
  age: number;
  baselineLegacy: string;
  strategyLegacy: string;
  difference: string;
  isPositive: boolean;
}

interface RMDAvoidanceRow {
  year: number;
  age: number;
  baselineRMD: string;
  strategyRMD: string;
  rmdAvoided: string;
  taxSaved: string;
}

interface TemplateData {
  clientName: string;
  clientAge: number;
  spouseName: string | null;
  spouseAge: number | null;
  showSpouse: boolean;
  filingStatus: string;
  initialDeposit: string;
  bonusRate: number;
  bonusAmount: string;
  startingWithBonus: string;
  hasBonus: boolean;
  riderFee: number;
  rateOfReturn: number;
  rateOfReturnPercent: string;
  maxTaxRate: number;
  state: string;
  stateTaxRate: number;
  stateTaxRatePercent: string;
  heirTaxRatePercent: string;
  lifetimeWealthBefore: string;
  lifetimeWealthAfter: string;
  wealthIncreasePercent: string;
  reportDate: string;
  legacyChartSVG: string;
  baseline: ScenarioData;
  strategy: ScenarioData;
  diff: {
    premiumBonus: number;
    netTaxCost: number;
    afterTax: number;
    legacyGross: number;
    legacyTax: number;
    legacyNet: number;
    totalDist: number;
    totalCosts: number;
  };
  conversionDetails: ConversionDetail[];
  conversionDetailsTotals: ConversionDetailsTotalsRow;
  branding: BrandingData;
  // New optional table sections
  sections?: {
    rothGrowth?: boolean;
    conversionPayback?: boolean;
    legacyComparison?: boolean;
    rmdAvoidance?: boolean;
  };
  rothGrowthTable?: RothGrowthRow[];
  rothGrowthTotals?: RothGrowthTotalsRow;
  conversionPaybackTable?: ConversionPaybackRow[];
  conversionPaybackTotals?: ConversionPaybackTotalsRow;
  legacyComparisonTable?: LegacyComparisonRow[];
  rmdAvoidanceTable?: RMDAvoidanceRow[];
  rmdAvoidanceTotals?: RMDAvoidanceTotalsRow;
}

function formatCurrency(cents: number): string {
  if (cents === 0) return '$0';
  // Infinity sneaks in via getBracketCeiling() when max_tax_rate = 37 (the
  // top federal bracket has no upper bound). Without this guard the PDF's
  // "Max Tax Bracket (37%)" column renders "$∞" for every row, which Jorge
  // Tola flagged as "the numbers don't appear" on Fred Schafer's report.
  // Em-dash matches the same totals-row convention already in the template.
  if (!Number.isFinite(cents)) return '—';
  const dollars = cents / 100;
  return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(dollars);
}

function formatPercent(rate: number): string {
  return `${rate}%`;
}

function getIRMAATier(age: number, tier: number | null | undefined): string {
  if (age < 65) return 'Pre-IRMAA';
  // Use the engine's irmaaTier (0 = Standard / below the first IRMAA threshold,
  // 1-5 = surcharge tiers). The old version returned "Tier 1" for a $0 surcharge —
  // labeling every 65+ client NOT in IRMAA as "Tier 1" on the client-facing PDF —
  // and used single-filer dollar bands that misclassified joint filers (audit F12).
  if (tier == null || tier <= 0) return 'Standard';
  return `Tier ${tier}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processYearlyData(years: any[], client: any, scenario: 'baseline' | 'formula'): {
  accountValues: YearRow[];
  taxableIncome: YearRow[];
  irmaa: YearRow[];
  netIncome: YearRow[];
  accountValuesTotals: AccountValuesTotalsRow;
  taxableIncomeTotals: TaxableIncomeTotalsRow;
} {
  const accountValues: YearRow[] = [];
  const taxableIncome: YearRow[] = [];
  const irmaa: YearRow[] = [];
  const netIncome: YearRow[] = [];

  // Raw running totals for the totals row at the bottom of each table.
  // Only flow-type columns are summed (distributions, taxes, conversions,
  // interest, income flows); balances and rates are not.
  let totDistIra = 0, totTaxesIra = 0, totRiderFee = 0, totConverted = 0, totDistRoth = 0, totInterest = 0;
  let totSsi = 0, totTaxableSs = 0, totTaxableNonSsi = 0, totExemptNonSsi = 0, totAgi = 0, totDeduction = 0, totTaxableIncome = 0;
  let totNetIncome = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  years.forEach((year: any, index: number) => {
    const prevYear = index > 0 ? years[index - 1] : null;
    const boyTraditional = prevYear
      ? prevYear.traditionalBalance
      : scenario === 'formula'
        ? Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 10) / 100))
        : (client.qualified_account_value ?? 0);
    const boyRoth = prevYear ? prevYear.rothBalance : (client.roth_ira ?? 0);
    const boyCombined = boyTraditional + boyRoth;
    const eoyCombined = year.traditionalBalance + year.rothBalance;
    // Baseline "Dist IRA" must include voluntary pre-RMD withdrawals, not just
    // the RMD. totalIRAWithdrawal = max(rmdRequired, voluntary IRA pull), so it
    // surfaces income the advisor scheduled before age 73 — previously this
    // column showed $0 in every pre-RMD year even with a withdrawal schedule
    // set (Gerald Shaw ticket). Falls back to rmdAmount for legacy rows.
    const distIra = scenario === 'baseline'
      ? (year.totalIRAWithdrawal ?? year.rmdAmount)
      : year.conversionAmount;
    // True interest = EOY - BOY + (money that left the combined balance this year).
    // What leaves: taxes paid FROM the IRA, spent IRA distributions (RMD +
    // voluntary pulls), and voluntary Roth withdrawals. Conversions move WITHIN
    // the combined balance (Traditional→Roth) so they're excluded. Prefer the
    // engine's totalIRAWithdrawal (captures voluntary IRA pulls beyond the RMD);
    // adding rothWithdrawal fixes the deeply-negative "interest" that showed for
    // clients with a Roth-draining withdrawal schedule (Jorge Tola ticket).
    const rothWithdrawal = year.rothWithdrawal ?? 0;
    const nonConversionIraOut = year.totalIRAWithdrawal != null
      ? Math.max(0, year.totalIRAWithdrawal - (year.conversionAmount ?? 0))
      : scenario === 'baseline'
        ? distIra
        : (year.taxesPaidFromIRA ?? 0) + (year.rmdAmount ?? 0);
    const interest = eoyCombined - boyCombined + nonConversionIraOut + rothWithdrawal;
    // Prefer engine-computed values so AGI/taxable-income reflect the true tax
    // picture (including any Social Security that becomes taxable via the
    // "tax torpedo"). Fall back to a local recompute only for legacy rows
    // generated before the engine exposed these fields.
    const deduction = year.standardDeduction ?? getStandardDeduction(client.filing_status, year.age, year.spouseAge ?? undefined, year.year);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year.year, client.tax_exempt_non_ssi ?? 0);
    const agi = year.agi ?? (year.otherIncome + distIra + (year.taxableSS ?? 0));
    const taxableIncomeVal = year.taxableIncome ?? Math.max(0, agi - deduction);
    const bracket = year.federalTaxBracket ?? determineTaxBracket(taxableIncomeVal, client.filing_status, year.year);
    const magi = year.magi ?? (agi + taxExemptNonSSI + (year.ssIncome - (year.taxableSS ?? 0)));
    // Net (After-Tax) = what actually hits the client's bank account this year.
    //
    // Cash inflows the client receives:
    //   - Social Security
    //   - Other taxable / tax-exempt income
    //   - RMDs (forced distributions — go to client whether the IRS or
    //     not; in 'reinvested' mode they land in taxable, in 'spent' mode
    //     in the bank, but in either case they're cash the client now
    //     controls). Both baseline and strategy can have RMDs after age 73.
    //   - Roth withdrawals (tax-free, qualified by assumption)
    //
    // Cash outflows (taxes the client actually pays out of their wallet):
    //   - When tax_payment_source = 'from_ira' on the STRATEGY side, the
    //     advisor has elected to fund all tax from the IRA — so the only
    //     truly out-of-pocket cost is IRMAA (Medicare premium surcharge,
    //     deducted from SS check, can't be paid from IRA).
    //   - Otherwise, the full year.totalTax (already bundles fed + state
    //     + IRMAA + early-withdrawal penalty) hits out-of-pocket.
    //
    // Conversions are NOT cash to the client — they move IRA → Roth and
    // stay inside retirement accounts. Don't add them, don't subtract.
    const payTaxFromIraStrategy = scenario === 'formula' && client.tax_payment_source === 'from_ira';
    const taxesOutOfPocket = payTaxFromIraStrategy
      ? (year.irmaaSurcharge ?? 0)
      : year.totalTax;
    const iraCashInflow = year.rmdAmount ?? 0;
    const rothCashIn = year.rothWithdrawal ?? 0;
    // AUM-bucket spending withdrawals are real cash leaving the managed
    // brokerage and arriving in the client's bank. The companion LTCG tax is
    // already inside year.totalTax (subtracted via taxesOutOfPocket below),
    // so adding the gross withdrawal here keeps the math symmetric with how
    // rothWithdrawal is treated. Without this, advisor-scheduled spending
    // funded out of the AUM bucket vanished from the Net (After-Tax) column
    // when aum_allocation_percent was high enough to absorb the request.
    const aumCashIn = year.aumScheduledWithdrawal ?? 0;
    const netIncomeVal =
      year.otherIncome +
      taxExemptNonSSI +
      year.ssIncome +
      iraCashInflow +
      rothCashIn +
      aumCashIn -
      taxesOutOfPocket;

    const baseRow = {
      year: year.year,
      age: year.age,
      spouseAge: year.spouseAge,
    };

    accountValues.push({
      ...baseRow,
      boyCombined: formatCurrency(boyCombined),
      distIra: formatCurrency(distIra),
      // "Taxes (IRA)" should reflect dollars actually withdrawn from the IRA to
      // cover taxes — NOT the year's total tax bill (which would include taxes on
      // SS, NQ withdrawals, IRMAA, etc. that aren't IRA-related).
      // For baseline, the IRS still gets the year's total tax. For strategy,
      // only conversion taxes paid from the IRA count.
      taxesIra: scenario === 'baseline'
        ? formatCurrency(year.totalTax)
        : formatCurrency(year.taxesPaidFromIRA ?? 0),
      bracket: formatPercent(bracket),
      converted: formatCurrency(year.conversionAmount),
      distRoth: formatCurrency(rothWithdrawal),
      interest: formatCurrency(interest),
      eoyCombined: formatCurrency(eoyCombined),
      ssi: '',
      taxableSs: '',
      taxableNonSsi: '',
      exemptNonSsi: '',
      agi: '',
      deduction: '',
      taxableIncome: '',
      taxExempt: '',
      magi: '',
      tier: '',
      irmaaTotal: '',
      taxableNonIra: '',
      taxExemptNonIra: '',
      taxesTotal: '',
      netIncome: '',
      riderFeeAmount: formatCurrency(year.riderFee ?? 0),
    });

    // Taxable portion of SS (engine field). Falls back to 0 for legacy rows
    // saved before the SS-torpedo engine fix (v29). Displayed explicitly so
    // accountants can verify provisional-income math without recomputing.
    const taxableSSAmount = year.taxableSS ?? 0;

    taxableIncome.push({
      ...baseRow,
      boyCombined: '',
      distIra: formatCurrency(distIra),
      taxesIra: '',
      bracket: '',
      converted: '',
      distRoth: '',
      interest: '',
      eoyCombined: '',
      ssi: formatCurrency(year.ssIncome),
      taxableSs: formatCurrency(taxableSSAmount),
      taxableNonSsi: formatCurrency(year.otherIncome),
      exemptNonSsi: formatCurrency(taxExemptNonSSI),
      agi: formatCurrency(agi),
      deduction: formatCurrency(deduction),
      taxableIncome: formatCurrency(taxableIncomeVal),
      taxExempt: '',
      magi: '',
      tier: '',
      irmaaTotal: '',
      taxableNonIra: '',
      taxExemptNonIra: '',
      taxesTotal: formatCurrency(year.totalTax + year.irmaaSurcharge),
      // Net (after-tax) spendable income — what actually hits the client's
      // bank account this year. Conversions are backed out of the strategy
      // side because converted dollars stay inside the Roth (not spendable).
      netIncome: formatCurrency(netIncomeVal),
      riderFeeAmount: '',
    });

    irmaa.push({
      ...baseRow,
      boyCombined: '',
      distIra: '',
      taxesIra: '',
      bracket: '',
      converted: '',
      distRoth: '',
      interest: '',
      eoyCombined: '',
      ssi: '',
      taxableSs: '',
      taxableNonSsi: '',
      exemptNonSsi: '',
      agi: formatCurrency(agi),
      deduction: '',
      taxableIncome: '',
      taxExempt: formatCurrency(taxExemptNonSSI),
      magi: formatCurrency(magi),
      tier: getIRMAATier(year.age, year.irmaaTier),
      irmaaTotal: formatCurrency(year.irmaaSurcharge),
      taxableNonIra: '',
      taxExemptNonIra: '',
      taxesTotal: '',
      netIncome: '',
      riderFeeAmount: '',
    });

    netIncome.push({
      ...baseRow,
      boyCombined: '',
      distIra: formatCurrency(distIra),
      taxesIra: '',
      bracket: '',
      converted: formatCurrency(year.conversionAmount),
      distRoth: formatCurrency(rothWithdrawal),
      interest: '',
      eoyCombined: '',
      ssi: '',
      taxableSs: '',
      taxableNonSsi: '',
      exemptNonSsi: '',
      agi: '',
      deduction: '',
      taxableIncome: '',
      taxExempt: '',
      magi: '',
      tier: '',
      irmaaTotal: formatCurrency(year.irmaaSurcharge),
      taxableNonIra: formatCurrency(year.otherIncome),
      taxExemptNonIra: formatCurrency(taxExemptNonSSI),
      taxesTotal: formatCurrency(year.totalTax),
      netIncome: formatCurrency(netIncomeVal),
      riderFeeAmount: '',
    });

    // Accumulate flow-column running totals.
    totDistIra += distIra;
    totTaxesIra += scenario === 'baseline'
      ? (year.totalTax ?? 0)
      : (year.taxesPaidFromIRA ?? 0);
    totRiderFee += year.riderFee ?? 0;
    totConverted += year.conversionAmount ?? 0;
    totDistRoth += rothWithdrawal; // voluntary Roth withdrawals (income the client takes)
    totInterest += interest;
    totSsi += year.ssIncome ?? 0;
    totTaxableSs += taxableSSAmount;
    totTaxableNonSsi += year.otherIncome ?? 0;
    totExemptNonSsi += taxExemptNonSSI;
    totAgi += agi;
    totDeduction += deduction;
    totTaxableIncome += taxableIncomeVal;
    totNetIncome += netIncomeVal;
  });

  return {
    accountValues,
    taxableIncome,
    irmaa,
    netIncome,
    accountValuesTotals: {
      distIra: formatCurrency(totDistIra),
      taxesIra: formatCurrency(totTaxesIra),
      riderFeeAmount: formatCurrency(totRiderFee),
      converted: formatCurrency(totConverted),
      distRoth: formatCurrency(totDistRoth),
      interest: formatCurrency(totInterest),
    },
    taxableIncomeTotals: {
      ssi: formatCurrency(totSsi),
      taxableSs: formatCurrency(totTaxableSs),
      taxableNonSsi: formatCurrency(totTaxableNonSsi),
      exemptNonSsi: formatCurrency(totExemptNonSsi),
      distIra: formatCurrency(totDistIra),
      agi: formatCurrency(totAgi),
      deduction: formatCurrency(totDeduction),
      taxableIncome: formatCurrency(totTaxableIncome),
      netIncome: formatCurrency(totNetIncome),
    },
  };
}

/**
 * Format cents for chart axis labels ($XK or $XM)
 */
function formatAxisLabel(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${(dollars / 1_000).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}

/**
 * Generate inline SVG for "Legacy to Heirs Over Time" chart
 * Uses same calculation as lib/calculations/transforms.ts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateLegacyChartSVG(projection: any, heirTaxRate: number, isNoConversion: boolean = false): string {
  const baselineYears = projection.baseline_years || [];
  const formulaYears = projection.blueprint_years || [];

  if (baselineYears.length === 0) return '<p style="color:#666;">No chart data available</p>';

  // Calculate legacy to heirs for each year — must match transforms.ts and
  // the PDF's own legacyComparisonTable, which both use the SIGNED taxable
  // balance. Flooring at 0 here hid the conversion-tax cost when taxes were
  // paid externally (negative taxable balance) and made the chart disagree
  // with the Page 1 Net Legacy figure by exactly that tax amount.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baselineData = baselineYears.map((year: any) => {
    const traditionalToHeirs = Math.round(year.traditionalBalance * (1 - heirTaxRate));
    const rothToHeirs = year.rothBalance || 0;
    const cashToHeirs = year.taxableBalance || 0;
    return { age: year.age, value: traditionalToHeirs + rothToHeirs + cashToHeirs };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formulaData = formulaYears.map((year: any) => {
    const traditionalToHeirs = Math.round(year.traditionalBalance * (1 - heirTaxRate));
    const rothToHeirs = year.rothBalance || 0;
    const cashToHeirs = year.taxableBalance || 0;
    return { age: year.age, value: traditionalToHeirs + rothToHeirs + cashToHeirs };
  });

  // Chart dimensions
  const width = 680;
  const height = 260;
  const padLeft = 70;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 40;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Determine data bounds
  const allValues = [...baselineData.map((d: { value: number }) => d.value), ...formulaData.map((d: { value: number }) => d.value)];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;
  // Add 10% padding to y range
  const yMin = Math.max(0, minVal - valRange * 0.1);
  const yMax = maxVal + valRange * 0.1;
  const yRange = yMax - yMin;

  const ages = baselineData.map((d: { age: number }) => d.age);
  const minAge = ages[0];
  const maxAge = ages[ages.length - 1];
  const ageRange = maxAge - minAge || 1;

  // Helper to convert data to SVG coordinates
  const toX = (age: number) => padLeft + ((age - minAge) / ageRange) * chartW;
  const toY = (val: number) => padTop + chartH - ((val - yMin) / yRange) * chartH;

  // Build polyline points
  const baselinePoints = baselineData
    .map((d: { age: number; value: number }) => `${toX(d.age).toFixed(1)},${toY(d.value).toFixed(1)}`)
    .join(' ');
  const formulaPoints = formulaData
    .map((d: { age: number; value: number }) => `${toX(d.age).toFixed(1)},${toY(d.value).toFixed(1)}`)
    .join(' ');

  // Y-axis grid lines and labels (5 ticks)
  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const val = yMin + (yRange * i) / 4;
    const y = toY(val);
    gridLines += `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5"/>`;
    gridLines += `<text x="${padLeft - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#6b7280">${formatAxisLabel(val)}</text>`;
  }

  // X-axis labels (every ~5 years)
  let xLabels = '';
  const step = Math.max(1, Math.round(ageRange / 8));
  for (let age = minAge; age <= maxAge; age += step) {
    const x = toX(age);
    xLabels += `<text x="${x.toFixed(1)}" y="${height - padBottom + 18}" text-anchor="middle" font-size="8" fill="#6b7280">${age}</text>`;
  }
  // Always include last age
  if ((maxAge - minAge) % step !== 0) {
    const x = toX(maxAge);
    xLabels += `<text x="${x.toFixed(1)}" y="${height - padBottom + 18}" text-anchor="middle" font-size="8" fill="#6b7280">${maxAge}</text>`;
  }

  // X-axis label
  const xAxisLabel = `<text x="${padLeft + chartW / 2}" y="${height - 2}" text-anchor="middle" font-size="9" fill="#6b7280">Age</text>`;

  // Legend
  const legendX = padLeft + 10;
  const legendY = padTop + 10;
  const legend = `
    <rect x="${legendX}" y="${legendY}" width="200" height="36" rx="4" fill="white" stroke="#e5e7eb" stroke-width="0.5"/>
    <line x1="${legendX + 10}" y1="${legendY + 12}" x2="${legendX + 30}" y2="${legendY + 12}" stroke="#D4AF37" stroke-width="2.5"/>
    <text x="${legendX + 35}" y="${legendY + 15}" font-size="8" fill="#333">${isNoConversion ? 'Strategy (No Conversion)' : 'Strategy (Roth Conversion)'}</text>
    <line x1="${legendX + 10}" y1="${legendY + 26}" x2="${legendX + 30}" y2="${legendY + 26}" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,3"/>
    <text x="${legendX + 35}" y="${legendY + 29}" font-size="8" fill="#333">Baseline (Traditional IRA)</text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family: 'Helvetica Neue', Arial, sans-serif;">
    <!-- Grid -->
    ${gridLines}
    <!-- Axes -->
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" stroke="#d1d5db" stroke-width="1"/>
    <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" stroke="#d1d5db" stroke-width="1"/>
    <!-- X labels -->
    ${xLabels}
    ${xAxisLabel}
    <!-- Baseline line (dashed red) -->
    <polyline points="${baselinePoints}" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="6,4"/>
    <!-- Formula line (solid gold) -->
    <polyline points="${formulaPoints}" fill="none" stroke="#D4AF37" stroke-width="2.5"/>
    <!-- Legend -->
    ${legend}
  </svg>`;
}

// Marginal RMD tax computation lives in lib/calculations/marginal-rmd-tax.ts so
// the PDF route, the in-app dashboards, and any future surface use the SAME
// computation. Surface drift on "Tax on RMDs" is the structural problem we keep
// getting bitten by.

// Build the display name shown on the cover and Client Data row. When the
// filing status is MFJ and we have a spouse name on file, both names are
// shown ("Robert & Amy Sprengel") so the spouse is acknowledged on the
// report — advisors flagged that omitting the spouse felt dismissive. Falls
// back to the primary name when MFS/single/HoH or no spouse_name is set.
function buildDisplayName(client: { name?: string | null; filing_status?: string | null; spouse_name?: string | null }): string {
  const primary = (client.name ?? '').trim() || 'Client'
  if (client.filing_status !== 'married_filing_jointly') return primary
  const spouse = (client.spouse_name ?? '').trim()
  if (!spouse) return primary
  // Shared last name — collapse to "First & SpouseFirst Last" when the spouse
  // is given as a single word (typical case on this form). Otherwise show
  // both full names joined.
  const primaryParts = primary.split(/\s+/)
  const primaryLast = primaryParts.length > 1 ? primaryParts[primaryParts.length - 1] : null
  const primaryFirst = primaryParts.length > 1 ? primaryParts.slice(0, -1).join(' ') : primary
  // Treat the spouse field as a bare first name only when it has no spaces
  // AND no hyphens. "Smith-Johnson" is a real surname, not a first name —
  // collapsing it via the shared-last-name path would produce nonsense like
  // "John & Smith-Johnson Doe".
  const spouseIsBareFirstName = !/[\s-]/.test(spouse)
  if (primaryLast && spouseIsBareFirstName) {
    return `${primaryFirst} & ${spouse} ${primaryLast}`
  }
  return `${primary} & ${spouse}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareTemplateData(reportData: any, branding: BrandingData): TemplateData {
  const { client, projection, customProduct } = reportData as { client: any; projection: any; customProduct: CustomProductRow | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

  // Calculate summary metrics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum = (years: any[], key: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    years.reduce((acc: number, curr: any) => acc + (Number(curr[key]) || 0), 0);

  // Use client's heir tax rate (matches growth-report-dashboard.tsx)
  const heirTaxRate = (client.heir_tax_rate ?? 40) / 100;
  const rmdTreatment = client.rmd_treatment ?? 'reinvested';

  // Baseline metrics (matches growth-report-dashboard.tsx lines 48-70)
  const baseRMDs = sum(projection.baseline_years, 'rmdAmount');
  const baseTax = sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax');
  const baseIrmaa = sum(projection.baseline_years, 'irmaaSurcharge');
  const baseFinalTraditional = projection.baseline_final_traditional;
  // Heir tax only applies to traditional IRA portion (Roth and taxable are already taxed)
  const baseHeirTax = Math.round(baseFinalTraditional * heirTaxRate);
  // Net legacy = final net worth (includes taxable account) minus heir taxes on traditional
  const baseNetLegacy = projection.baseline_final_net_worth - baseHeirTax;
  // Cumulative after-tax distributions — kept for the Distributions row in
  // the breakdown table; no longer rolled into Lifetime Wealth.
  const lastBaselineYear = projection.baseline_years[projection.baseline_years.length - 1];
  const baseCumulativeDistributions = lastBaselineYear?.cumulativeDistributions ?? 0;
  // Lifetime Wealth = net legacy on both sides (apples-to-apples).
  const baseLifetimeWealth = baseNetLegacy;
  const baseTotalTaxes = baseTax + baseIrmaa + baseHeirTax;

  // RMD-attributable tax for baseline (marginal) — for each year with an RMD,
  // re-run the tax calc without the RMD and take the difference. Strategy
  // typically has zero RMDs (conversions empty the IRA before age 73), so its
  // value will usually be 0; we still compute it for symmetry/edge cases.
  const baseRMDTaxOnly = computeMarginalRMDTax(projection.baseline_years, client);
  const blueRMDTaxOnly = computeMarginalRMDTax(projection.blueprint_years, client);

  // Formula metrics (matches growth-report-dashboard.tsx lines 73-84)
  const blueConversions = sum(projection.blueprint_years, 'conversionAmount');
  const blueTax = sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax');
  // Conversion-attributable tax only — the marginal federal + state tax
  // owed because of the conversions themselves. Excludes background tax on
  // W-2/business income, Social Security, RMDs, etc. that the client would
  // pay regardless. Matches the year-by-year totals in the Conversion Details
  // and Conversion Cost & Payback tables.
  const blueConversionTaxOnly =
    sum(projection.blueprint_years, 'federalTaxOnConversions') +
    sum(projection.blueprint_years, 'stateTaxOnConversions');
  const blueIrmaa = sum(projection.blueprint_years, 'irmaaSurcharge');
  const blueFinalTraditional = projection.blueprint_final_traditional;
  // Heir tax only applies to remaining traditional IRA (if any)
  const blueHeirTax = Math.round(blueFinalTraditional * heirTaxRate);
  // Net legacy = final net worth minus heir taxes on traditional
  const blueNetLegacy = projection.blueprint_final_net_worth - blueHeirTax;
  // Lifetime wealth = net legacy (conversion taxes/IRMAA already deducted from taxable in engine)
  const blueLifetimeWealth = blueNetLegacy;
  const blueTotalTaxes = blueTax + blueIrmaa + blueHeirTax;

  const wealthIncrease = baseLifetimeWealth > 0
    ? ((blueLifetimeWealth - baseLifetimeWealth) / Math.abs(baseLifetimeWealth)) * 100
    : 0;

  // Process yearly data
  const baselineData = processYearlyData(projection.baseline_years, client, 'baseline');
  const formulaData = processYearlyData(projection.blueprint_years, client, 'formula');

  // Get conversion details (years with conversions)
  // Track original indices so prevYear lookup uses the correct year from the full array
  const conversionYearsWithIndex = projection.blueprint_years
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((year: any, originalIndex: number) => ({ year, originalIndex }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter(({ year }: { year: any }) => year.conversionAmount > 0);

  // Track flow-column running totals for the conversion-details totals row.
  let cdTotExistingTaxable = 0, cdTotDistribution = 0, cdTotTaxes = 0, cdTotConversion = 0, cdTotInterest = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversionDetails: ConversionDetail[] = conversionYearsWithIndex.map(({ year, originalIndex }: { year: any; originalIndex: number }) => {
    const prevYear = originalIndex > 0 ? projection.blueprint_years[originalIndex - 1] : null;
    const boyTraditional = prevYear
      ? prevYear.traditionalBalance
      : Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 10) / 100));
    const boyRoth = prevYear ? prevYear.rothBalance : (client.roth_ira ?? 0);
    const boyCombined = boyTraditional + boyRoth;
    const eoyCombined = year.traditionalBalance + year.rothBalance;
    // Real interest = EOY − BOY + (money that left the combined balance).
    // Conversions move within the combined balance (Traditional→Roth) so they
    // don't leave. What DOES leave: taxes paid from the IRA, spent IRA
    // distributions (RMD + voluntary pulls), and voluntary Roth withdrawals.
    // Prefer the engine's totalIRAWithdrawal (it already captures voluntary IRA
    // pulls beyond the RMD); subtract the conversion since that stays in the
    // combined balance. Add Roth withdrawals — previously omitted, which made
    // "interest" dive deeply negative for any client with a withdrawal schedule
    // that pulls from the Roth (Jorge Tola / Richard Goldstein ticket).
    const rothWithdrawal = year.rothWithdrawal ?? 0;
    const nonConversionIraOut = year.totalIRAWithdrawal != null
      ? Math.max(0, year.totalIRAWithdrawal - (year.conversionAmount ?? 0))
      : (year.taxesPaidFromIRA ?? 0) + (year.rmdAmount ?? 0);
    const interest = eoyCombined - boyCombined + nonConversionIraOut + rothWithdrawal;

    // Pre-conversion taxable income now includes the taxable portion of SS
    // (which the engine computes via the SS-tax-torpedo formula). This is the
    // bracket position the conversion starts from.
    const existingTaxableIncome = year.otherIncome + (year.taxableSS ?? 0);
    const distributionAmount = year.totalIRAWithdrawal ?? year.conversionAmount;
    const conversionTaxAmount = (year.federalTaxOnConversions ?? 0) + (year.stateTaxOnConversions ?? 0);

    cdTotExistingTaxable += existingTaxableIncome;
    cdTotDistribution += distributionAmount;
    cdTotTaxes += conversionTaxAmount;
    cdTotConversion += year.conversionAmount;
    cdTotInterest += interest;

    return {
      age: year.age,
      existingTaxable: formatCurrency(existingTaxableIncome),
      // Dollars actually withdrawn from the IRA: the conversion plus any tax
      // funded from the IRA. Falls back to conversion alone for external-tax
      // scenarios where the two are equal.
      distribution: formatCurrency(distributionAmount),
      bracketCeiling: formatCurrency(getBracketCeiling(client.filing_status, client.max_tax_rate ?? 24, year.year)),
      // Marginal tax cost of the conversion — the extra federal + state tax
      // the client owes because of this conversion (including any SS that
      // became taxable as the conversion raised provisional income).
      taxes: formatCurrency(conversionTaxAmount),
      conversionAmount: formatCurrency(year.conversionAmount),
      interest: formatCurrency(interest),
      eoyIra: formatCurrency(year.traditionalBalance),
      eoyRoth: formatCurrency(year.rothBalance),
    };
  });

  const conversionDetailsTotals: ConversionDetailsTotalsRow = {
    existingTaxable: formatCurrency(cdTotExistingTaxable),
    distribution: formatCurrency(cdTotDistribution),
    taxes: formatCurrency(cdTotTaxes),
    conversionAmount: formatCurrency(cdTotConversion),
    interest: formatCurrency(cdTotInterest),
  };

  const filingStatusMap: Record<string, string> = {
    single: 'Single',
    married_filing_jointly: 'Married Filing Jointly',
    married_filing_separately: 'Married Filing Separately',
    head_of_household: 'Head of Household',
  };

  // Rider fee rate. Custom products override the system preset's value via the
  // resolver — getEffectiveGrowthRiderFee returns the decimal (0.0095 for 0.95%),
  // so we multiply by 100 for display. Displayed on the Performance Report's
  // Contract Details card so advisors can point to the fee line item.
  const productRiderFee = getEffectiveGrowthRiderFee(client.blueprint_type as FormulaType, customProduct) * 100;
  // Premium bonus in dollars received at contract issue — applied only on the
  // strategy side (baseline is a "do nothing" scenario, no product bonus).
  // Used for the "Premium Bonus Received" / "Net Tax Cost" rows in the
  // Distributions summary so advisors can show net-of-bonus tax math.
  const premiumBonusDollars = Math.round(
    (client.qualified_account_value ?? 0) * ((client.bonus_percent ?? 0) / 100),
  );
  // Net out-of-pocket tax: event-attributable tax (RMDs for baseline,
  // conversions for strategy) less the premium bonus. This is the honest
  // "what does this strategy cost me" figure for client presentations.
  // Previously used total lifetime tax which polluted the comparison with
  // background W-2 / SS tax that both scenarios pay regardless.
  const baselineNetOutOfPocketTax = baseRMDTaxOnly;
  const strategyNetOutOfPocketTax = blueConversionTaxOnly - premiumBonusDollars;

  // Spouse info for the Client Data block. The PDF previously showed only
  // the primary client's age, which omitted the spouse's age entirely on
  // MFJ reports - flagged by Scott Kenik (ticket 5adba41e). When the
  // filing status is married (MFJ or MFS) and a spouse is on file, the
  // template renders an additional Spouse Age row.
  const isMarried = client.filing_status === 'married_filing_jointly'
    || client.filing_status === 'married_filing_separately';
  // Only render the Spouse Age row when we actually have an age. If only a
  // spouse name is on file the row would render with an empty value, which
  // looks like a broken field.
  const showSpouse = isMarried && client.spouse_age != null;

  return {
    clientName: buildDisplayName(client),
    clientAge: client.age,
    spouseName: client.spouse_name ?? null,
    spouseAge: client.spouse_age ?? null,
    showSpouse,
    filingStatus: filingStatusMap[client.filing_status] || client.filing_status,
    initialDeposit: formatCurrency(client.qualified_account_value),
    bonusRate: client.bonus_percent ?? 10,
    // Pre-computed for the PDF so the template can show "starting balance
    // with bonus applied" alongside the raw deposit — matches what the
    // engine actually starts year 1 with and what the in-app Account
    // Summary displays.
    bonusAmount: formatCurrency(
      Math.round((client.qualified_account_value ?? 0) * ((client.bonus_percent ?? 0) / 100))
    ),
    startingWithBonus: formatCurrency(
      Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 0) / 100))
    ),
    hasBonus: (client.bonus_percent ?? 0) > 0,
    riderFee: productRiderFee,
    rateOfReturn: client.rate_of_return ?? 7,
    rateOfReturnPercent: String(client.rate_of_return ?? 7),
    maxTaxRate: client.max_tax_rate ?? 24,
    state: client.state ?? 'CA',
    stateTaxRate: client.state_tax_rate ?? 0,
    stateTaxRatePercent: String(client.state_tax_rate ?? 0),
    // Glossary surfaces these as plain percent strings so the template
    // can interpolate them into the Key Assumptions block without doing
    // its own numeric formatting.
    heirTaxRatePercent: String(client.heir_tax_rate ?? 40),
    lifetimeWealthBefore: formatCurrency(baseLifetimeWealth),
    lifetimeWealthAfter: formatCurrency(blueLifetimeWealth),
    wealthIncreasePercent: wealthIncrease.toFixed(2),
    reportDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    legacyChartSVG: generateLegacyChartSVG(projection, heirTaxRate, client.conversion_type === 'no_conversion'),
    // Wealth section: keep the identity Lifetime Wealth = Total Dist + Legacy
    // − Total Costs honest on both sides. Defining totalDist as
    // (lifetimeWealth + totalCosts) makes that math close to the dollar.
    //
    // The previous baseline formula (baseRMDs + baseline_final_net_worth)
    // double-counted RMDs whenever rmd_treatment was "reinvested" / "cash"
    // because the engine already deposits net RMD proceeds into
    // baseline_final_taxable each year — adding baseRMDs again on top
    // counted the same dollars twice. The strategy formula
    // (blueprint_final_net_worth alone) was missing the tax money that left
    // the accounts during life, so the strategy column also failed the
    // identity. Computing both sides as lifetimeWealth + totalCosts fixes
    // both inconsistencies and reads as "all wealth that flowed through the
    // accounts before tax was paid" — which is what advisors expect.
    baseline: {
      totalDistributions: formatCurrency(baseRMDs),
      totalConversions: formatCurrency(0),
      taxOnConversionsOnly: formatCurrency(0),
      taxOnRMDsOnly: formatCurrency(baseRMDTaxOnly),
      premiumBonusReceived: formatCurrency(0),
      netTaxCost: formatCurrency(baselineNetOutOfPocketTax),
      afterTaxDistributions: formatCurrency(rmdTreatment === 'spent' ? baseCumulativeDistributions : baseRMDs - baseTax),
      legacyGross: formatCurrency(projection.baseline_final_net_worth),
      legacyTax: formatCurrency(baseHeirTax),
      legacyNet: formatCurrency(baseNetLegacy),
      totalDist: formatCurrency(baseLifetimeWealth + baseTotalTaxes),
      totalCosts: formatCurrency(baseTotalTaxes),
      lifetimeWealth: formatCurrency(baseLifetimeWealth),
      ...baselineData,
    },
    strategy: {
      totalDistributions: formatCurrency(0),
      totalConversions: formatCurrency(blueConversions),
      taxOnConversionsOnly: formatCurrency(blueConversionTaxOnly),
      taxOnRMDsOnly: formatCurrency(blueRMDTaxOnly),
      premiumBonusReceived: formatCurrency(premiumBonusDollars),
      netTaxCost: formatCurrency(strategyNetOutOfPocketTax),
      afterTaxDistributions: formatCurrency(0),
      legacyGross: formatCurrency(projection.blueprint_final_net_worth),
      legacyTax: formatCurrency(blueHeirTax),
      legacyNet: formatCurrency(blueNetLegacy),
      totalDist: formatCurrency(blueLifetimeWealth + blueTotalTaxes),
      totalCosts: formatCurrency(blueTotalTaxes),
      lifetimeWealth: formatCurrency(blueLifetimeWealth),
      ...formulaData,
    },
    diff: {
      // Raw values for use with formatDiff helper (dollars, converted from cents)
      premiumBonus: (premiumBonusDollars - 0) / 100,
      netTaxCost: (strategyNetOutOfPocketTax - baselineNetOutOfPocketTax) / 100,
      afterTax: (0 - (rmdTreatment === 'spent' ? baseCumulativeDistributions : baseRMDs - baseTax)) / 100,
      legacyGross: (projection.blueprint_final_net_worth - projection.baseline_final_net_worth) / 100,
      legacyTax: (blueHeirTax - baseHeirTax) / 100,
      legacyNet: (blueNetLegacy - baseNetLegacy) / 100,
      totalDist: ((blueLifetimeWealth + blueTotalTaxes) - (baseLifetimeWealth + baseTotalTaxes)) / 100,
      totalCosts: (blueTotalTaxes - baseTotalTaxes) / 100,
    },
    conversionDetails,
    conversionDetailsTotals,
    branding,
    // New table data (generated regardless, conditionally shown via sections flags)
    rothGrowthTable: (() => {
      let cumulativeGrowth = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return projection.blueprint_years.map((year: any) => {
        const annualGrowth = year.rothGrowth || 0;
        cumulativeGrowth += annualGrowth;
        return {
          year: year.year,
          age: year.age,
          rothBalance: formatCurrency(year.rothBalance),
          annualGrowth: formatCurrency(annualGrowth),
          cumulativeGrowth: formatCurrency(cumulativeGrowth),
        };
      });
    })(),
    rothGrowthTotals: {
      // Sum of annual growth equals the final cumulative growth — only the flow
      // column is summed; balance and cumulative columns are not.
      annualGrowth: formatCurrency(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projection.blueprint_years.reduce((s: number, y: any) => s + (y.rothGrowth || 0), 0),
      ),
    },
    conversionPaybackTable: (() => {
      let cumulativeConversionTax = 0;
      const initialRoth = client.roth_ira ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return projection.blueprint_years.map((year: any) => {
        // Tax COST of the conversion itself = federal + state tax attributable
        // to the conversion. NOT year.totalTax, which would include tax on SS,
        // NQ withdrawals, IRMAA, etc. — those persist after conversions are done
        // and would make the "Tax Paid" column non-zero in years with $0 conversion.
        const conversionTax = (year.federalTaxOnConversions ?? 0) + (year.stateTaxOnConversions ?? 0);
        cumulativeConversionTax += conversionTax;
        const rothValueGained = year.rothBalance - initialRoth;
        return {
          year: year.year,
          age: year.age,
          conversionAmount: formatCurrency(year.conversionAmount),
          taxPaid: formatCurrency(conversionTax),
          cumulativeTaxPaid: formatCurrency(cumulativeConversionTax),
          rothValueGained: formatCurrency(rothValueGained),
        };
      });
    })(),
    conversionPaybackTotals: {
      conversionAmount: formatCurrency(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projection.blueprint_years.reduce((s: number, y: any) => s + (y.conversionAmount || 0), 0),
      ),
      taxPaid: formatCurrency(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projection.blueprint_years.reduce((s: number, y: any) => s + ((y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0)), 0),
      ),
    },
    legacyComparisonTable: (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return projection.blueprint_years.map((year: any) => {
        const baseYear = projection.baseline_years.find((y: any) => y.year === year.year);
        if (!baseYear) return null;
        // Include signed taxableBalance so legacy reconciles with the dashboard
        // "Legacy to Heirs" stat card. When conversion tax is paid externally,
        // taxableBalance goes negative and is a real cost; omitting it inflated
        // strategy legacy by the conversion-tax amount.
        const baseLegacy = Math.round(baseYear.traditionalBalance * (1 - heirTaxRate)) + (baseYear.rothBalance || 0) + (baseYear.taxableBalance || 0);
        const stratLegacy = Math.round(year.traditionalBalance * (1 - heirTaxRate)) + (year.rothBalance || 0) + (year.taxableBalance || 0);
        const diff = stratLegacy - baseLegacy;
        return {
          year: year.year,
          age: year.age,
          baselineLegacy: formatCurrency(baseLegacy),
          strategyLegacy: formatCurrency(stratLegacy),
          difference: formatCurrency(Math.abs(diff)),
          isPositive: diff >= 0,
        };
      }).filter(Boolean);
    })(),
    rmdAvoidanceTable: (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return projection.baseline_years.filter((y: any) => y.rmdAmount > 0).map((baseYear: any, _: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stratYear = projection.blueprint_years.find((y: any) => y.year === baseYear.year);
        const baseRMD = baseYear.rmdAmount || 0;
        const stratRMD = stratYear?.rmdAmount || 0;
        const avoided = baseRMD - stratRMD;
        // Tax saved uses the engine's actual marginal bracket for that
        // baseline year (set per-year in the simulation). Falls back to the
        // bracket ceiling configured for the strategy if the engine didn't
        // surface a marginal bracket. Previously this used client.tax_rate
        // ("Current Bracket (informational)") as a flat 22% multiplier —
        // less accurate than the per-year marginal the engine already computed.
        const bracketPct = (baseYear.federalTaxBracket ?? client.max_tax_rate ?? 22) as number;
        const taxSaved = Math.round(avoided * (bracketPct / 100));
        return {
          year: baseYear.year,
          age: baseYear.age,
          baselineRMD: formatCurrency(baseRMD),
          strategyRMD: formatCurrency(stratRMD),
          rmdAvoided: formatCurrency(avoided),
          taxSaved: formatCurrency(taxSaved),
        };
      });
    })(),
    rmdAvoidanceTotals: (() => {
      // Total tax saved = sum of per-year (avoidedRMD * thatYear'sBracket).
      // Per-year bracket is what the engine actually applied; falls back to
      // the strategy's bracket ceiling if missing.
      let baseSum = 0, stratSum = 0, taxSavedSum = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projection.baseline_years.filter((y: any) => y.rmdAmount > 0).forEach((baseYear: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stratYear = projection.blueprint_years.find((y: any) => y.year === baseYear.year);
        const baseRMD = baseYear.rmdAmount || 0;
        const stratRMD = stratYear?.rmdAmount || 0;
        baseSum += baseRMD;
        stratSum += stratRMD;
        const bracketPct = (baseYear.federalTaxBracket ?? client.max_tax_rate ?? 22) as number;
        taxSavedSum += Math.round((baseRMD - stratRMD) * (bracketPct / 100));
      });
      const avoidedSum = baseSum - stratSum;
      return {
        baselineRMD: formatCurrency(baseSum),
        strategyRMD: formatCurrency(stratSum),
        rmdAvoided: formatCurrency(avoidedSum),
        taxSaved: formatCurrency(taxSavedSum),
      };
    })(),
  };
}

// GI Year Row for PDF table
interface GIYearRow {
  year: number;
  age: number;
  phase: string;
  phaseClass: string;
  incomeBase: string;
  accountValue: string;
  giIncome: string;
  taxes: string;
  riderFee: string;
  netIncome: string;
  cumulative: string;
  isIncomePhase?: boolean;
  isDeferral?: boolean;
}

// GI Template Data interface
interface GITemplateData {
  clientName: string;
  reportDate: string;
  branding: BrandingData;

  // Hero metrics
  strategyAnnualIncome: string;
  baselineAnnualIncomeGross: string;
  baselineAnnualIncomeNet: string;

  // Key metrics
  taxFreeWealthCreated: string;
  percentImprovement: string;
  strategyLifetimeIncome: string;
  baselineLifetimeIncome: string;
  lifetimeIncomeAdvantage: string;
  strategyTotalTaxes: string;
  baselineTotalTaxes: string;
  taxSavings: string;

  // Break-even
  breakEvenYears: number | null;
  breakEvenAge: number | null;

  // Income details
  incomeStartAge: number;
  payoutType: string;
  payoutPercent: string;

  // 4-Phase journey
  showConversionPhase: boolean;
  conversionYears: number;
  conversionTax: string;
  purchaseAge: number;
  purchaseAmount: string;
  deferralYears: number;
  rollUpGrowth: string;

  // Income Base calculation
  deposit: string;
  bonusAmount: string;
  bonusPercent: number;
  startingIncomeBase: string;
  finalIncomeBase: string;
  calculatedIncome: string;

  // Guarantee section
  depletionAge: number | null;
  lifetimeIncomeGross: string;
  endAge: number;
  baselineAnnualTax: string;
  annualAdvantage: string;

  // Product details
  carrierName: string;
  productName: string;
  riderFee: string;
  rollUpDescription: string;
  totalRiderFees: string;

  // Year-by-year tables
  strategyYears: GIYearRow[];
  baselineYears: GIYearRow[];
  taxRate: number;
  // Show the optional per-year Rider Fee column when the product charges one
  showRiderFee: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareGITemplateData(reportData: any, branding: BrandingData): GITemplateData {
  const { client, projection, customProduct } = reportData as { client: any; projection: any; customProduct: CustomProductRow | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

  const giYearlyData = projection.gi_yearly_data || [];
  const baselineGIYearlyData = projection.gi_baseline_yearly_data || [];
  // Effective tax rate the engine actually applied to baseline GI income,
  // derived from gi_baseline_annual_tax / gi_baseline_annual_income_gross
  // (federal + state, bracket-aware, includes SS taxability). Previously this
  // read client.tax_rate ("Current Bracket (informational)") which has been
  // retired in favor of bracket-aware math everywhere.
  const taxRate = projection.gi_baseline_annual_income_gross && projection.gi_baseline_annual_income_gross > 0
    ? Math.round((projection.gi_baseline_annual_tax / projection.gi_baseline_annual_income_gross) * 100)
    : 0;
  const flatTaxRate = taxRate / 100;

  // Calculate metrics
  // Use gi_purchase_amount (Roth balance at purchase) NOT client.qualified_account_value (Traditional IRA before conversion)
  const purchaseAmount = projection.gi_purchase_amount ?? client.qualified_account_value ?? 0;
  const bonusPercent = client.bonus_percent || 0;
  const bonusAmount = Math.round(purchaseAmount * (bonusPercent / 100));
  const startingIncomeBase = projection.gi_income_base_at_start ?? (purchaseAmount + bonusAmount);
  const finalIncomeBase = projection.gi_income_base_at_income_age || startingIncomeBase;
  const rollUpGrowth = finalIncomeBase - startingIncomeBase;
  const payoutPercent = projection.gi_payout_percent || 0;
  const calculatedIncome = Math.round(finalIncomeBase * (payoutPercent / 100));

  // Income calculations (matches gi-report-dashboard.tsx)
  const strategyAnnualIncome = projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0;
  const baselineAnnualIncomeGross = projection.gi_baseline_annual_income_gross || 0;
  const baselineAnnualIncomeNet = projection.gi_baseline_annual_income_net || 0;
  const baselineAnnualTax = projection.gi_baseline_annual_tax || Math.round(baselineAnnualIncomeGross * flatTaxRate);
  const annualAdvantage = strategyAnnualIncome - baselineAnnualIncomeNet;

  const incomeStartAge = projection.gi_income_start_age || client.income_start_age || 70;
  const endAge = client.end_age || 100;

  // Sum baseline lifetime income and taxes from yearly data. The engine now
  // computes `guaranteedIncomeNet` with full SS-aware tax math (federal +
  // state on gross GI + any taxable SS + other income), so prefer the engine
  // value over a flat-rate approximation.
  let baselineTotalNetIncome = 0;
  let baselineTotalTaxes = 0;
  baselineGIYearlyData.forEach((row: any) => {
    if (row.phase === 'income') {
      const grossIncome = row.guaranteedIncomeGross || 0;
      const netIncome = row.guaranteedIncomeNet ?? grossIncome - Math.round(grossIncome * flatTaxRate);
      baselineTotalNetIncome += netIncome;
      baselineTotalTaxes += grossIncome - netIncome;
    }
  });
  // Fallback if yearly data not available.
  if (baselineTotalNetIncome === 0 && projection.gi_baseline_annual_income_net) {
    const incomeYears = endAge - incomeStartAge + 1;
    baselineTotalNetIncome = projection.gi_baseline_annual_income_net * incomeYears;
  }
  if (baselineTotalTaxes === 0) {
    const incomeYears = endAge - incomeStartAge + 1;
    baselineTotalTaxes = Math.round(baselineAnnualIncomeGross * flatTaxRate) * incomeYears;
  }

  // Lifetime income
  const strategyLifetimeIncome = projection.gi_total_net_paid || 0;
  const baselineLifetimeIncome = baselineTotalNetIncome;
  const lifetimeIncomeAdvantage = strategyLifetimeIncome - baselineLifetimeIncome;

  // Taxes
  const conversionTax = projection.gi_total_conversion_tax || 0;
  const taxSavings = baselineTotalTaxes - conversionTax;

  // Tax-free wealth created
  const taxFreeWealthCreated = projection.gi_tax_free_wealth_created || lifetimeIncomeAdvantage;
  const percentImprovement = projection.gi_percent_improvement ||
    (baselineLifetimeIncome > 0 ? ((taxFreeWealthCreated / baselineLifetimeIncome) * 100) : 0);

  // Process strategy years
  let strategyCumulative = 0;
  const strategyYears: GIYearRow[] = giYearlyData.map((row: any) => {
    if (row.guaranteedIncomeNet > 0) {
      strategyCumulative += row.guaranteedIncomeNet;
    }

    const phaseMap: Record<string, string> = {
      conversion: 'Convert',
      purchase: 'Purchase',
      deferral: 'Grow',
      income: 'Income',
    };

    const phaseClassMap: Record<string, string> = {
      conversion: 'phase-convert',
      purchase: 'phase-purchase',
      deferral: 'phase-grow',
      income: 'phase-income',
    };

    return {
      year: row.year,
      age: row.age,
      phase: phaseMap[row.phase] || row.phase,
      phaseClass: phaseClassMap[row.phase] || '',
      incomeBase: row.incomeBase > 0 ? formatCurrency(row.incomeBase) : '—',
      accountValue: row.phase === 'conversion' || row.phase === 'purchase' ? '—' :
        (row.accountValue <= 0 ? '$0' : formatCurrency(row.accountValue)),
      giIncome: row.guaranteedIncomeGross > 0 ? formatCurrency(row.guaranteedIncomeGross) : '—',
      taxes: row.conversionTax > 0 ? formatCurrency(row.conversionTax) : '—',
      riderFee: row.riderFee > 0 ? formatCurrency(row.riderFee) : '—',
      netIncome: row.guaranteedIncomeNet > 0 ? formatCurrency(row.guaranteedIncomeNet) : '—',
      cumulative: strategyCumulative > 0 ? formatCurrency(strategyCumulative) : '—',
      isIncomePhase: row.phase === 'income',
      isDeferral: row.phase === 'deferral',
    };
  });

  // Process baseline years. Use the engine's `guaranteedIncomeNet` (which
  // correctly accounts for SS taxation now) instead of a flat-rate
  // approximation; fall back to the flat rate only if the engine value is
  // missing (legacy yearly data).
  let baselineCumulative = 0;
  const baselineYears: GIYearRow[] = baselineGIYearlyData.map((row: any) => {
    const isIncomePhase = row.phase === 'income';
    const grossIncome = row.guaranteedIncomeGross || 0;
    const netIncome = isIncomePhase
      ? (row.guaranteedIncomeNet ?? grossIncome - Math.round(grossIncome * flatTaxRate))
      : 0;
    const taxOnIncome = isIncomePhase ? grossIncome - netIncome : 0;

    if (isIncomePhase && netIncome > 0) {
      baselineCumulative += netIncome;
    }

    const phaseMap: Record<string, string> = {
      deferral: 'Grow',
      income: 'Income',
    };

    const phaseClassMap: Record<string, string> = {
      deferral: 'phase-grow',
      income: 'phase-income',
    };

    return {
      year: row.year,
      age: row.age,
      phase: phaseMap[row.phase] || row.phase,
      phaseClass: phaseClassMap[row.phase] || '',
      incomeBase: row.incomeBase > 0 ? formatCurrency(row.incomeBase) : '—',
      accountValue: row.accountValue <= 0 ? '$0' : formatCurrency(row.accountValue),
      giIncome: grossIncome > 0 ? formatCurrency(grossIncome) : '—',
      taxes: taxOnIncome > 0 ? formatCurrency(taxOnIncome) : '—',
      riderFee: row.riderFee > 0 ? formatCurrency(row.riderFee) : '—',
      netIncome: netIncome > 0 ? formatCurrency(netIncome) : '—',
      cumulative: baselineCumulative > 0 ? formatCurrency(baselineCumulative) : '—',
      isIncomePhase,
      isDeferral: row.phase === 'deferral',
    };
  });

  const payoutTypeDisplay = client.payout_type === 'joint' ? 'Joint Life' : 'Single Life';

  return {
    clientName: buildDisplayName(client),
    reportDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    branding,

    // Hero
    strategyAnnualIncome: formatCurrency(strategyAnnualIncome),
    baselineAnnualIncomeGross: formatCurrency(baselineAnnualIncomeGross),
    baselineAnnualIncomeNet: formatCurrency(baselineAnnualIncomeNet),

    // Key metrics
    taxFreeWealthCreated: formatCurrency(taxFreeWealthCreated),
    percentImprovement: percentImprovement.toFixed(1),
    strategyLifetimeIncome: formatCurrency(strategyLifetimeIncome),
    baselineLifetimeIncome: formatCurrency(baselineLifetimeIncome),
    lifetimeIncomeAdvantage: formatCurrency(lifetimeIncomeAdvantage),
    strategyTotalTaxes: formatCurrency(conversionTax),
    baselineTotalTaxes: formatCurrency(baselineTotalTaxes),
    taxSavings: formatCurrency(taxSavings),

    // Break-even
    breakEvenYears: projection.gi_break_even_years || null,
    breakEvenAge: projection.gi_break_even_age || null,

    // Income details
    incomeStartAge,
    payoutType: payoutTypeDisplay,
    payoutPercent: payoutPercent.toFixed(2),

    // 4-Phase journey
    showConversionPhase: (projection.gi_conversion_phase_years || 0) > 0,
    conversionYears: projection.gi_conversion_phase_years || 0,
    conversionTax: formatCurrency(conversionTax),
    purchaseAge: projection.gi_purchase_age || 0,
    purchaseAmount: formatCurrency(projection.gi_purchase_amount || 0),
    deferralYears: projection.gi_deferral_years || 0,
    rollUpGrowth: formatCurrency(rollUpGrowth),

    // Income Base calculation (deposit = GI premium = Roth balance at purchase)
    deposit: formatCurrency(purchaseAmount),
    bonusAmount: formatCurrency(bonusAmount),
    bonusPercent,
    startingIncomeBase: formatCurrency(startingIncomeBase),
    finalIncomeBase: formatCurrency(finalIncomeBase),
    calculatedIncome: formatCurrency(calculatedIncome),

    // Guarantee section
    depletionAge: projection.gi_depletion_age || null,
    lifetimeIncomeGross: formatCurrency(projection.gi_total_gross_paid || 0),
    endAge,
    baselineAnnualTax: formatCurrency(baselineAnnualTax),
    annualAdvantage: formatCurrency(annualAdvantage),

    // Product details
    carrierName: client.carrier_name || 'N/A',
    productName: client.product_name || 'N/A',
    // Custom GI products can override the rider fee — fall back to the system
    // preset's value when no custom product is attached.
    riderFee: (
      getEffectiveGIData(
        client.blueprint_type as Parameters<typeof getEffectiveGIData>[0],
        customProduct,
      )?.riderFee
        ?? client.rider_fee
        ?? 1.00
    ).toFixed(2),
    rollUpDescription: projection.gi_roll_up_description || 'N/A',
    totalRiderFees: formatCurrency(projection.gi_total_rider_fees || 0),

    // Year-by-year tables
    strategyYears,
    baselineYears,
    taxRate,
    showRiderFee: strategyYears.some((r) => r.riderFee !== '—') || baselineYears.some((r) => r.riderFee !== '—'),
  };
}

// Legacy (no-income) GI report. Reuses the income prep's year-by-year tables +
// product details, then layers the death-benefit / legacy framing on top —
// mirroring GILegacyReportDashboard exactly so the PDF matches the on-screen
// report. Without this, a legacy client gets the income template and renders
// "$0/year", "Starting Age: 999", "Payout 0.00%" — the income story doesn't
// apply when no income is ever taken.
function prepareGILegacyTemplateData(reportData: any, branding: BrandingData): GITemplateData { // eslint-disable-line @typescript-eslint/no-explicit-any
  const base = prepareGITemplateData(reportData, branding);
  const { client, projection } = reportData as { client: any; projection: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

  const lastOf = <T,>(arr: T[] | null | undefined): T | undefined => (arr && arr.length ? arr[arr.length - 1] : undefined);
  const sumKey = (arr: any[] | null | undefined, key: string) => (arr ?? []).reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0); // eslint-disable-line @typescript-eslint/no-explicit-any

  const heirRate = (client.heir_tax_rate ?? 40) / 100;

  // Death benefit = rolled-up benefit base paid to heirs over 5 years.
  const strategyDB = (lastOf(projection.gi_yearly_data) as any)?.incomeBase ?? 0; // eslint-disable-line @typescript-eslint/no-explicit-any
  const baselineDB = (lastOf(projection.gi_baseline_yearly_data) as any)?.incomeBase ?? 0; // eslint-disable-line @typescript-eslint/no-explicit-any
  const strategyTaxable = (lastOf(projection.blueprint_years) as any)?.taxableBalance ?? 0; // eslint-disable-line @typescript-eslint/no-explicit-any
  const baselineTaxable = (lastOf(projection.baseline_years) as any)?.taxableBalance ?? 0; // eslint-disable-line @typescript-eslint/no-explicit-any

  const strategyLegacy = strategyDB + strategyTaxable;
  const baselineDBAfterTax = Math.round(baselineDB * (1 - heirRate));
  const baselineLegacy = baselineDBAfterTax + baselineTaxable;
  const additionalLegacy = strategyLegacy - baselineLegacy;
  const legacyWinning = additionalLegacy >= 0;

  const lifetimeRMD = sumKey(projection.baseline_years, 'rmdAmount');
  const lifetimeRMDTax = sumKey(projection.baseline_years, 'federalTax') + sumKey(projection.baseline_years, 'stateTax');

  const finalAge = (lastOf(projection.blueprint_years) as any)?.age ?? (client.end_age ?? 100); // eslint-disable-line @typescript-eslint/no-explicit-any

  // Roll-up of the benefit base from purchase to the final death benefit. The
  // income-mode finalIncomeBase (gi_income_base_at_income_age) is empty in
  // legacy mode — derive from the final benefit base instead.
  const purchaseAmt = projection.gi_purchase_amount ?? client.qualified_account_value ?? 0;
  const bonusAmt = Math.round(purchaseAmt * ((client.bonus_percent || 0) / 100));
  const startingBase = projection.gi_income_base_at_start ?? (purchaseAmt + bonusAmt);
  const legacyRollUpGrowth = Math.max(0, strategyDB - startingBase);

  return {
    ...base,
    isLegacy: true,
    legacyHeroLabel: legacyWinning ? 'Tax-Free Legacy to Your Heirs' : 'Legacy to Your Heirs',
    legacyWinning,
    strategyLegacy: formatCurrency(strategyLegacy),
    strategyDeathBenefit: formatCurrency(strategyDB),
    showStrategyDeathBenefit: strategyDB > 0,
    baselineLegacy: formatCurrency(baselineLegacy),
    baselineDeathBenefitAfterTax: formatCurrency(baselineDBAfterTax),
    strategyTaxableLegacy: formatCurrency(strategyTaxable),
    baselineTaxableLegacy: formatCurrency(baselineTaxable),
    additionalLegacy: formatCurrency(Math.abs(additionalLegacy)),
    lifetimeRMD: formatCurrency(lifetimeRMD),
    lifetimeRMDTax: formatCurrency(lifetimeRMDTax),
    heirTaxRatePct: Math.round(heirRate * 100),
    finalAge,
    finalDeathBenefit: formatCurrency(strategyDB),
    legacyRollUpGrowth: formatCurrency(legacyRollUpGrowth),
  } as unknown as GITemplateData;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check PDF export limit
    const usageCheck = await checkUsageLimit(user.id, 'pdf_exports');
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: 'PDF export limit reached',
          message: `You've used ${usageCheck.current}/${usageCheck.limit} PDF exports this month. Upgrade to Pro for unlimited exports.`,
          current: usageCheck.current,
          limit: usageCheck.limit,
          showUpgrade: true,
        },
        { status: 403 }
      );
    }

    // Check plan for white-label branding
    const { plan: effectivePlan } = await getEffectivePlan(user.id);
    const showPoweredBy = !hasFeature(effectivePlan, 'whiteLabel');

    const body = await request.json();
    const { reportData, brandingOverrides, title, sections } = body;

    if (!reportData || !reportData.client || !reportData.projection) {
      return NextResponse.json(
        { error: 'Missing required report data' },
        { status: 400 }
      );
    }

    // Defense-in-depth: validate that the authenticated user is allowed to
    // render a report for the client referenced in reportData.client.id.
    // The PDF is built from body data (so technically the attacker would
    // already need to know the data to render it), BUT this stops:
    //   - export_log rows being filed under another advisor's client_id
    //   - future code that re-reads from the DB by client.id from leaking
    //   - accidental cross-tenant exports via UI bug or copied URL
    // Scope mirrors the rest of the client-detail endpoints.
    if (reportData.client?.id) {
      const visibleUserIdsForReport = await getVisibleUserIds(supabase, user.id);
      const { data: authorizedClient } = await supabase
        .from('clients')
        .select('user_id')
        .eq('id', reportData.client.id)
        .in('user_id', visibleUserIdsForReport)
        .maybeSingle();
      if (!authorizedClient) {
        return NextResponse.json(
          { error: 'Forbidden — client not in your scope' },
          { status: 403 }
        );
      }
    }

    // Fetch user settings for branding
    const { data: settings } = await supabase
      .from('user_settings')
      .select('company_name, tagline, company_phone, company_email, company_website, logo_url, logo_light_url, primary_color, secondary_color')
      .eq('user_id', user.id)
      .single();

    const branding: BrandingData = {
      companyName: settings?.company_name || '',
      tagline: settings?.tagline || '',
      logoUrl: settings?.logo_url || '',
      logoLightUrl: settings?.logo_light_url || settings?.logo_url || '',
      phone: settings?.company_phone || '',
      email: settings?.company_email || '',
      website: settings?.company_website || '',
      primaryColor: settings?.primary_color || '#1a3a5c',
      secondaryColor: settings?.secondary_color || '#4ecdc4',
      hasBranding: !!(settings?.company_name || settings?.logo_url),
      hasContactInfo: !!(settings?.company_phone || settings?.company_email || settings?.company_website),
    };

    // Apply branding overrides from export dialog (plans with white-label feature)
    if (hasFeature(effectivePlan, 'whiteLabel') && brandingOverrides) {
      if (brandingOverrides.companyName !== undefined) branding.companyName = brandingOverrides.companyName;
      if (brandingOverrides.tagline !== undefined) branding.tagline = brandingOverrides.tagline;
      if (brandingOverrides.logoUrl !== undefined) branding.logoUrl = brandingOverrides.logoUrl;
      if (brandingOverrides.primaryColor) branding.primaryColor = brandingOverrides.primaryColor;
      if (brandingOverrides.secondaryColor) branding.secondaryColor = brandingOverrides.secondaryColor;
      if (brandingOverrides.phone !== undefined) branding.phone = brandingOverrides.phone;
      if (brandingOverrides.email !== undefined) branding.email = brandingOverrides.email;
      if (brandingOverrides.website !== undefined) branding.website = brandingOverrides.website;
      branding.hasBranding = !!(branding.companyName || branding.logoUrl);
      branding.hasContactInfo = !!(branding.phone || branding.email || branding.website);
    }

    // Detect if this is a GI product, and whether it's running in legacy
    // (no-income / death-benefit) mode — those use a different template + data
    // prep so the income narrative isn't rendered for a client taking no income.
    const blueprintType = reportData.client.blueprint_type as FormulaType;
    const isGI = blueprintType && isGuaranteedIncomeProduct(blueprintType);
    const isGILegacy = isGI && !!reportData.client.gi_legacy_mode;

    // If the client is using a custom product, load it so the rider fee /
    // GI roll-up / payout factors used in the PDF match what the engine uses.
    // Without this the PDF would silently fall back to the system preset's
    // rider fee even when the advisor configured a different value.
    const customProductId = reportData.client.custom_product_id as string | null | undefined;
    const customProduct = customProductId
      ? await getCustomProduct(user.id, customProductId)
      : null;
    reportData.customProduct = customProduct;

    // Load and compile the appropriate template
    const templateFileName = isGI
      ? (isGILegacy ? 'gi-legacy-pdf-template.html' : 'gi-pdf-template.html')
      : 'pdf-template.html';
    const templatePath = path.join(process.cwd(), 'templates', templateFileName);
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(templateHtml);

    // Prepare data for the appropriate template
    const templateData = isGI
      ? (isGILegacy
          ? prepareGILegacyTemplateData(reportData, branding)
          : prepareGITemplateData(reportData, branding))
      : prepareTemplateData(reportData, branding);

    // Add white-label flag
    (templateData as unknown as Record<string, unknown>).showPoweredBy = showPoweredBy;

    // SECURE 2.0 RMD start age for this client (73 born ≤1959, 75 born 1960+) —
    // the template must not hardcode 73 (Lori Avant ticket).
    (templateData as unknown as Record<string, unknown>).rmdStartAge = getClientRMDStartAge(reportData.client);

    // Add section visibility flags
    // Default all to true so existing pages render when sections aren't specified
    const defaultSections = {
      baselineIncome: true,
      strategyIncome: true,
      rothGrowth: false,
      conversionPayback: false,
      legacyComparison: false,
      rmdAvoidance: false,
      // Default ON for glossary so the explanation page is included unless
      // an advisor explicitly turns it off. Most useful the first few times
      // a client sees the report.
      glossary: true,
    };
    (templateData as unknown as Record<string, unknown>).sections = !isGI
      ? { ...defaultSections, ...(sections || {}) }
      : defaultSections;

    // Generate HTML
    const html = template(templateData);

    // Configure Chromium for serverless environment
    const executablePath = await chromium.executablePath();

    // Launch Puppeteer with guaranteed cleanup
    let browser;
    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });

      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: 'networkidle0',
      });

      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in',
        },
      });

      await browser.close();
      browser = null;

      // Prepare file metadata
      const clientName = reportData.client.name || 'Client';
      const sanitizedName = clientName
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '_');
      const pdfPrefix = isGI ? 'RetirementExpert_GI' : 'RetirementExpert';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // 2026-03-11T10-30-45
      const fileName = `${pdfPrefix}_${sanitizedName}_${timestamp}.pdf`;
      const filePath = `${user.id}/${fileName}`;

      // Save PDF to Supabase Storage and Database (SYNCHRONOUS - wait for it)
      try {
        // Upload to storage (uses user client for RLS)
        const { error: uploadError } = await supabase.storage
          .from('reports')
          .upload(filePath, pdf, {
            contentType: 'application/pdf',
            upsert: false,
          });

        if (uploadError) {
          console.error('[Report History] Storage upload error:', uploadError);
        } else {
          // Save metadata to database (use admin client to bypass RLS)
          const adminClient = createAdminClient();
          const { error: dbError } = await adminClient
            .from('report_history')
            .insert({
              user_id: user.id,
              client_id: reportData.client.id || null,
              file_name: fileName,
              file_path: filePath,
              file_size: pdf.length,
              report_type: isGI ? 'guaranteed_income' : 'growth',
              client_name: clientName,
              title: title && title.trim() ? title.trim() : null, // Save optional title
            });

          if (dbError) {
            console.error('[Report History] Database insert error:', JSON.stringify(dbError));
          } else {
            console.log('[Report History] Successfully saved:', fileName);
          }
        }
      } catch (err) {
        console.error('[Report History] Save error:', err);
      }

      // Log export (fire-and-forget)
      if (reportData.client.id) {
        Promise.resolve(supabase.from('export_log').insert({
          user_id: user.id,
          client_id: reportData.client.id,
          export_type: 'pdf',
        })).catch(console.error)
      }

      // Increment PDF export usage (fire-and-forget)
      incrementUsage(user.id, 'pdf_exports').catch(console.error);

      // Return PDF for immediate download
      return new NextResponse(Buffer.from(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
