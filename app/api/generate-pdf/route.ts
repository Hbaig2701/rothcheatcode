import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isGuaranteedIncomeProduct, ALL_PRODUCTS, type FormulaType } from '@/lib/config/products';
import { checkUsageLimit, incrementUsage, getEffectivePlan } from '@/lib/usage';
import { hasFeature, hasFullAccess } from '@/lib/config/plans';
import { determineTaxBracket } from '@/lib/calculations/modules/federal-tax';
import { getStandardDeduction } from '@/lib/data/standard-deductions';
import { getBracketCeiling } from '@/lib/data/federal-brackets-2026';
import { getTaxExemptIncomeForYear } from '@/lib/calculations/utils/income';

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

interface ScenarioData {
  totalDistributions: string;
  totalConversions: string;
  taxOnDistributions: string;
  taxOnConversions: string;
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
  filingStatus: string;
  initialDeposit: string;
  bonusRate: number;
  rateOfReturn: number;
  maxTaxRate: number;
  state: string;
  stateTaxRate: number;
  lifetimeWealthBefore: string;
  lifetimeWealthAfter: string;
  wealthIncreasePercent: string;
  reportDate: string;
  legacyChartSVG: string;
  baseline: ScenarioData;
  strategy: ScenarioData;
  diff: {
    distributions: number;
    taxes: number;
    afterTax: number;
    legacyGross: number;
    legacyTax: number;
    legacyNet: number;
    totalDist: number;
    totalCosts: number;
  };
  conversionDetails: ConversionDetail[];
  branding: BrandingData;
  // New optional table sections
  sections?: {
    rothGrowth?: boolean;
    conversionPayback?: boolean;
    legacyComparison?: boolean;
    rmdAvoidance?: boolean;
  };
  rothGrowthTable?: RothGrowthRow[];
  conversionPaybackTable?: ConversionPaybackRow[];
  legacyComparisonTable?: LegacyComparisonRow[];
  rmdAvoidanceTable?: RMDAvoidanceRow[];
}

function formatCurrency(cents: number): string {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(dollars);
}

function formatPercent(rate: number): string {
  return `${rate}%`;
}

function getIRMAATier(age: number, irmaaSurcharge: number): string {
  if (age < 65) return 'Pre-IRMAA';
  if (irmaaSurcharge === 0) return 'Tier 1';
  const annualSurcharge = irmaaSurcharge / 100;
  if (annualSurcharge < 1000) return 'Tier 1';
  if (annualSurcharge < 2500) return 'Tier 2';
  if (annualSurcharge < 4000) return 'Tier 3';
  if (annualSurcharge < 5500) return 'Tier 4';
  if (annualSurcharge < 7000) return 'Tier 5';
  return 'Tier 6';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processYearlyData(years: any[], client: any, scenario: 'baseline' | 'formula'): {
  accountValues: YearRow[];
  taxableIncome: YearRow[];
  irmaa: YearRow[];
  netIncome: YearRow[];
} {
  const accountValues: YearRow[] = [];
  const taxableIncome: YearRow[] = [];
  const irmaa: YearRow[] = [];
  const netIncome: YearRow[] = [];

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
    const distIra = scenario === 'baseline' ? year.rmdAmount : year.conversionAmount;
    // For baseline: RMDs leave the combined balance, so add back to get true interest
    // For formula: conversions move within combined (Traditional→Roth), don't leave it
    const interest = scenario === 'baseline'
      ? eoyCombined - boyCombined + distIra
      : eoyCombined - boyCombined;
    const grossIncome = year.otherIncome + distIra;
    const agi = grossIncome;
    const deduction = getStandardDeduction(client.filing_status, year.age, year.spouseAge ?? undefined, year.year);
    const taxableIncomeVal = Math.max(0, agi - deduction);
    const bracket = determineTaxBracket(taxableIncomeVal, client.filing_status, year.year);
    const taxExemptNonSSI = getTaxExemptIncomeForYear(client, year.year, client.tax_exempt_non_ssi ?? 0);
    const magi = agi + taxExemptNonSSI + year.ssIncome;
    const netIncomeVal =
      year.otherIncome +
      taxExemptNonSSI +
      year.ssIncome +
      distIra -
      year.totalTax -
      year.irmaaSurcharge -
      (scenario === 'formula' ? year.conversionAmount : 0);

    const baseRow = {
      year: year.year,
      age: year.age,
      spouseAge: year.spouseAge,
    };

    accountValues.push({
      ...baseRow,
      boyCombined: formatCurrency(boyCombined),
      distIra: formatCurrency(distIra),
      taxesIra: formatCurrency(year.totalTax),
      bracket: formatPercent(bracket),
      converted: formatCurrency(year.conversionAmount),
      distRoth: '$0',
      interest: formatCurrency(interest),
      eoyCombined: formatCurrency(eoyCombined),
      ssi: '',
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
    });

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
      taxesTotal: '',
      netIncome: '',
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
      taxableNonSsi: '',
      exemptNonSsi: '',
      agi: formatCurrency(agi),
      deduction: '',
      taxableIncome: '',
      taxExempt: formatCurrency(taxExemptNonSSI),
      magi: formatCurrency(magi),
      tier: getIRMAATier(year.age, year.irmaaSurcharge),
      irmaaTotal: formatCurrency(year.irmaaSurcharge),
      taxableNonIra: '',
      taxExemptNonIra: '',
      taxesTotal: '',
      netIncome: '',
    });

    netIncome.push({
      ...baseRow,
      boyCombined: '',
      distIra: formatCurrency(distIra),
      taxesIra: '',
      bracket: '',
      converted: formatCurrency(year.conversionAmount),
      distRoth: '$0',
      interest: '',
      eoyCombined: '',
      ssi: '',
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
    });
  });

  return { accountValues, taxableIncome, irmaa, netIncome };
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
function generateLegacyChartSVG(projection: any, heirTaxRate: number): string {
  const baselineYears = projection.baseline_years || [];
  const formulaYears = projection.blueprint_years || [];

  if (baselineYears.length === 0) return '<p style="color:#666;">No chart data available</p>';

  // Calculate legacy to heirs for each year (same logic as transforms.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baselineData = baselineYears.map((year: any) => {
    const traditionalToHeirs = Math.round(year.traditionalBalance * (1 - heirTaxRate));
    const rothToHeirs = year.rothBalance || 0;
    const cashToHeirs = Math.max(0, year.taxableBalance || 0);
    return { age: year.age, value: traditionalToHeirs + rothToHeirs + cashToHeirs };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formulaData = formulaYears.map((year: any) => {
    const traditionalToHeirs = Math.round(year.traditionalBalance * (1 - heirTaxRate));
    const rothToHeirs = year.rothBalance || 0;
    const cashToHeirs = Math.max(0, year.taxableBalance || 0);
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
    <text x="${legendX + 35}" y="${legendY + 15}" font-size="8" fill="#333">Strategy (Roth Conversion)</text>
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareTemplateData(reportData: any, branding: BrandingData): TemplateData {
  const { client, projection } = reportData;

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
  // Get cumulative after-tax distributions for 'spent' scenario
  const lastBaselineYear = projection.baseline_years[projection.baseline_years.length - 1];
  const baseCumulativeDistributions = lastBaselineYear?.cumulativeDistributions ?? 0;
  // Lifetime wealth depends on RMD treatment
  const baseLifetimeWealth = rmdTreatment === 'spent'
    ? baseNetLegacy + baseCumulativeDistributions
    : baseNetLegacy;
  const baseTotalTaxes = baseTax + baseIrmaa + baseHeirTax;

  // Formula metrics (matches growth-report-dashboard.tsx lines 73-84)
  const blueConversions = sum(projection.blueprint_years, 'conversionAmount');
  const blueTax = sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversionDetails: ConversionDetail[] = conversionYearsWithIndex.map(({ year, originalIndex }: { year: any; originalIndex: number }) => {
    const prevYear = originalIndex > 0 ? projection.blueprint_years[originalIndex - 1] : null;
    const boyTraditional = prevYear
      ? prevYear.traditionalBalance
      : Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 10) / 100));
    const boyRoth = prevYear ? prevYear.rothBalance : (client.roth_ira ?? 0);
    const boyCombined = boyTraditional + boyRoth;
    const eoyCombined = year.traditionalBalance + year.rothBalance;
    // Conversions move within combined balance (Traditional→Roth), don't leave it
    const interest = eoyCombined - boyCombined;

    return {
      age: year.age,
      existingTaxable: formatCurrency(year.otherIncome),
      distribution: formatCurrency(year.conversionAmount),
      bracketCeiling: formatCurrency(getBracketCeiling(client.filing_status, client.max_tax_rate ?? 24, year.year)),
      taxes: formatCurrency(year.totalTax),
      conversionAmount: formatCurrency(year.conversionAmount),
      interest: formatCurrency(interest),
      eoyIra: formatCurrency(year.traditionalBalance),
      eoyRoth: formatCurrency(year.rothBalance),
    };
  });

  const filingStatusMap: Record<string, string> = {
    single: 'Single',
    married_filing_jointly: 'Married Filing Jointly',
    married_filing_separately: 'Married Filing Separately',
    head_of_household: 'Head of Household',
  };

  return {
    clientName: client.name,
    clientAge: client.age,
    filingStatus: filingStatusMap[client.filing_status] || client.filing_status,
    initialDeposit: formatCurrency(client.qualified_account_value),
    bonusRate: client.bonus_percent ?? 10,
    rateOfReturn: client.rate_of_return ?? 7,
    maxTaxRate: client.max_tax_rate ?? 24,
    state: client.state ?? 'CA',
    stateTaxRate: client.state_tax_rate ?? 0,
    lifetimeWealthBefore: formatCurrency(baseLifetimeWealth),
    lifetimeWealthAfter: formatCurrency(blueLifetimeWealth),
    wealthIncreasePercent: wealthIncrease.toFixed(2),
    reportDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    legacyChartSVG: generateLegacyChartSVG(projection, heirTaxRate),
    baseline: {
      totalDistributions: formatCurrency(baseRMDs),
      totalConversions: formatCurrency(0),
      taxOnDistributions: formatCurrency(baseTax),
      taxOnConversions: formatCurrency(0),
      afterTaxDistributions: formatCurrency(rmdTreatment === 'spent' ? baseCumulativeDistributions : baseRMDs - baseTax),
      legacyGross: formatCurrency(projection.baseline_final_net_worth),
      legacyTax: formatCurrency(baseHeirTax),
      legacyNet: formatCurrency(baseNetLegacy),
      totalDist: formatCurrency(baseRMDs + projection.baseline_final_net_worth),
      totalCosts: formatCurrency(baseTotalTaxes),
      lifetimeWealth: formatCurrency(baseLifetimeWealth),
      ...baselineData,
    },
    strategy: {
      totalDistributions: formatCurrency(0),
      totalConversions: formatCurrency(blueConversions),
      taxOnDistributions: formatCurrency(0),
      taxOnConversions: formatCurrency(blueTax),
      afterTaxDistributions: formatCurrency(0),
      legacyGross: formatCurrency(projection.blueprint_final_net_worth),
      legacyTax: formatCurrency(blueHeirTax),
      legacyNet: formatCurrency(blueNetLegacy),
      totalDist: formatCurrency(projection.blueprint_final_net_worth),
      totalCosts: formatCurrency(blueTotalTaxes),
      lifetimeWealth: formatCurrency(blueLifetimeWealth),
      ...formulaData,
    },
    diff: {
      // Raw values for use with formatDiff helper (cents)
      distributions: (blueConversions - baseRMDs) / 100,
      taxes: (blueTax - baseTax) / 100,
      afterTax: (0 - (rmdTreatment === 'spent' ? baseCumulativeDistributions : baseRMDs - baseTax)) / 100,
      legacyGross: (projection.blueprint_final_net_worth - projection.baseline_final_net_worth) / 100,
      legacyTax: (blueHeirTax - baseHeirTax) / 100,
      legacyNet: (blueNetLegacy - baseNetLegacy) / 100,
      totalDist: (projection.blueprint_final_net_worth - (baseRMDs + projection.baseline_final_net_worth)) / 100,
      totalCosts: (blueTotalTaxes - baseTotalTaxes) / 100,
    },
    conversionDetails,
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
    conversionPaybackTable: (() => {
      let cumulativeTax = 0;
      const initialRoth = client.roth_ira ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return projection.blueprint_years.map((year: any) => {
        cumulativeTax += year.totalTax || 0;
        const rothValueGained = year.rothBalance - initialRoth;
        return {
          year: year.year,
          age: year.age,
          conversionAmount: formatCurrency(year.conversionAmount),
          taxPaid: formatCurrency(year.totalTax),
          cumulativeTaxPaid: formatCurrency(cumulativeTax),
          rothValueGained: formatCurrency(rothValueGained),
        };
      });
    })(),
    legacyComparisonTable: (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return projection.blueprint_years.map((year: any, idx: number) => {
        const baseYear = projection.baseline_years[idx];
        if (!baseYear) return null;
        const baseLegacy = Math.round(baseYear.traditionalBalance * (1 - heirTaxRate)) + (baseYear.rothBalance || 0);
        const stratLegacy = Math.round(year.traditionalBalance * (1 - heirTaxRate)) + (year.rothBalance || 0);
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
        const taxRate = (client.tax_rate ?? 22) / 100;
        const taxSaved = Math.round(avoided * taxRate);
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareGITemplateData(reportData: any, branding: BrandingData): GITemplateData {
  const { client, projection } = reportData;

  const giYearlyData = projection.gi_yearly_data || [];
  const baselineGIYearlyData = projection.gi_baseline_yearly_data || [];
  const taxRate = client.tax_rate || 24;
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

  // Calculate baseline lifetime income from yearly data (matches gi-report-dashboard.tsx lines 80-93)
  let baselineTotalNetIncome = 0;
  baselineGIYearlyData.forEach((row: any) => {
    if (row.phase === 'income') {
      const grossIncome = row.guaranteedIncomeGross || 0;
      const taxAtFlatRate = Math.round(grossIncome * flatTaxRate);
      baselineTotalNetIncome += grossIncome - taxAtFlatRate;
    }
  });
  // Fallback if yearly data not available
  if (baselineTotalNetIncome === 0 && projection.gi_baseline_annual_income_net) {
    const incomeYears = endAge - incomeStartAge + 1;
    baselineTotalNetIncome = projection.gi_baseline_annual_income_net * incomeYears;
  }

  // Lifetime income
  const strategyLifetimeIncome = projection.gi_total_net_paid || 0;
  const baselineLifetimeIncome = baselineTotalNetIncome;
  const lifetimeIncomeAdvantage = strategyLifetimeIncome - baselineLifetimeIncome;

  // Taxes
  const conversionTax = projection.gi_total_conversion_tax || 0;
  // Sum baseline taxes from yearly data for accuracy
  let baselineTotalTaxes = 0;
  baselineGIYearlyData.forEach((row: any) => {
    if (row.phase === 'income') {
      const grossIncome = row.guaranteedIncomeGross || 0;
      baselineTotalTaxes += Math.round(grossIncome * flatTaxRate);
    }
  });
  if (baselineTotalTaxes === 0) {
    const incomeYears = endAge - incomeStartAge + 1;
    baselineTotalTaxes = Math.round(baselineAnnualIncomeGross * flatTaxRate) * incomeYears;
  }
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
      netIncome: row.guaranteedIncomeNet > 0 ? formatCurrency(row.guaranteedIncomeNet) : '—',
      cumulative: strategyCumulative > 0 ? formatCurrency(strategyCumulative) : '—',
      isIncomePhase: row.phase === 'income',
      isDeferral: row.phase === 'deferral',
    };
  });

  // Process baseline years
  let baselineCumulative = 0;
  const baselineYears: GIYearRow[] = baselineGIYearlyData.map((row: any) => {
    const isIncomePhase = row.phase === 'income';
    const grossIncome = row.guaranteedIncomeGross || 0;
    const taxOnIncome = isIncomePhase ? Math.round(grossIncome * flatTaxRate) : 0;
    const netIncome = grossIncome - taxOnIncome;

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
      netIncome: netIncome > 0 ? formatCurrency(netIncome) : '—',
      cumulative: baselineCumulative > 0 ? formatCurrency(baselineCumulative) : '—',
      isIncomePhase,
      isDeferral: row.phase === 'deferral',
    };
  });

  const payoutTypeDisplay = client.payout_type === 'joint' ? 'Joint Life' : 'Single Life';

  return {
    clientName: client.name,
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
    riderFee: (ALL_PRODUCTS[client.blueprint_type as FormulaType]?.defaults.riderFee ?? client.rider_fee ?? 1.00).toFixed(2),
    rollUpDescription: projection.gi_roll_up_description || 'N/A',
    totalRiderFees: formatCurrency(projection.gi_total_rider_fees || 0),

    // Year-by-year tables
    strategyYears,
    baselineYears,
    taxRate,
  };
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

    // Detect if this is a GI product
    const blueprintType = reportData.client.blueprint_type as FormulaType;
    const isGI = blueprintType && isGuaranteedIncomeProduct(blueprintType);

    // Load and compile the appropriate template
    const templateFileName = isGI ? 'gi-pdf-template.html' : 'pdf-template.html';
    const templatePath = path.join(process.cwd(), 'templates', templateFileName);
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(templateHtml);

    // Prepare data for the appropriate template
    const templateData = isGI
      ? prepareGITemplateData(reportData, branding)
      : prepareTemplateData(reportData, branding);

    // Add white-label flag
    (templateData as unknown as Record<string, unknown>).showPoweredBy = showPoweredBy;

    // Add section visibility flags
    // Default all to true so existing pages render when sections aren't specified
    const defaultSections = {
      baselineIncome: true,
      strategyIncome: true,
      rothGrowth: false,
      conversionPayback: false,
      legacyComparison: false,
      rmdAvoidance: false,
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
