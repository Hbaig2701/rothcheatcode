import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { isGuaranteedIncomeProduct, type FormulaType } from '@/lib/config/products';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for PDF generation

// Register Handlebars helpers
Handlebars.registerHelper('formatCurrency', (value: number) => {
  if (value === 0) return '$0';
  return '$' + new Intl.NumberFormat('en-US').format(Math.round(value));
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
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
  secondaryColor: string;
  hasBranding: boolean;
  hasContactInfo: boolean;
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
  lifetimeWealthChartImage?: string;
  conversionChartImage?: string;
  baseline: ScenarioData;
  formula: ScenarioData;
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
}

function formatCurrency(cents: number): string {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(dollars);
}

function formatPercent(rate: number): string {
  return `${rate}%`;
}

function formatAge(primaryAge: number, spouseAge?: number | null): string {
  if (spouseAge !== null && spouseAge !== undefined && spouseAge > 0) {
    return `${primaryAge} / ${spouseAge}`;
  }
  return primaryAge.toString();
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

function determineBracket(taxableIncome: number, filingStatus: string): number {
  const income = taxableIncome / 100;
  if (filingStatus === 'married_filing_jointly') {
    if (income <= 23850) return 10;
    if (income <= 96950) return 12;
    if (income <= 206700) return 22;
    if (income <= 403550) return 24;
    if (income <= 487450) return 32;
    if (income <= 731200) return 35;
    return 37;
  } else {
    if (income <= 11925) return 10;
    if (income <= 48475) return 12;
    if (income <= 103350) return 22;
    if (income <= 201775) return 24;
    if (income <= 243725) return 32;
    if (income <= 609350) return 35;
    return 37;
  }
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
    const interest = eoyCombined - boyCombined + distIra;
    const grossIncome = year.otherIncome + distIra;
    const agi = grossIncome;
    const deduction = 15000 * 100; // Simplified standard deduction
    const taxableIncomeVal = Math.max(0, agi - deduction);
    const bracket = determineBracket(taxableIncomeVal, client.filing_status);
    const taxExemptNonSSI = client.tax_exempt_non_ssi ?? 0;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prepareTemplateData(reportData: any, charts: { lifetimeWealth?: string; conversion?: string }, branding: BrandingData): TemplateData {
  const { client, projection } = reportData;

  // Calculate summary metrics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum = (years: any[], key: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    years.reduce((acc: number, curr: any) => acc + (Number(curr[key]) || 0), 0);

  const heirTaxRate = 0.40;

  // Baseline metrics
  const baseRMDs = sum(projection.baseline_years, 'rmdAmount');
  const baseTax = sum(projection.baseline_years, 'federalTax') + sum(projection.baseline_years, 'stateTax');
  const baseIrmaa = sum(projection.baseline_years, 'irmaaSurcharge');
  const baseFinalBalance = projection.baseline_final_net_worth;
  const baseAfterTaxDist = baseRMDs - baseTax;
  const baseNetLegacy = baseFinalBalance * (1 - heirTaxRate);
  const baseLegacyTax = baseFinalBalance * heirTaxRate;
  const baseLifetimeWealth = baseNetLegacy + baseAfterTaxDist - baseIrmaa;
  const baseTotalCosts = baseTax + baseIrmaa + baseLegacyTax;

  // Formula metrics
  const blueConversions = sum(projection.blueprint_years, 'conversionAmount');
  const blueTax = sum(projection.blueprint_years, 'federalTax') + sum(projection.blueprint_years, 'stateTax');
  const blueIrmaa = sum(projection.blueprint_years, 'irmaaSurcharge');
  const blueFinalBalance = projection.blueprint_final_net_worth;
  const blueNetLegacy = blueFinalBalance;
  const blueLegacyTax = 0;
  const blueLifetimeWealth = blueFinalBalance - blueTax - blueIrmaa;
  const blueTotalCosts = blueTax + blueIrmaa + blueLegacyTax;

  const wealthIncrease = baseLifetimeWealth > 0
    ? ((blueLifetimeWealth - baseLifetimeWealth) / baseLifetimeWealth) * 100
    : 0;

  // Process yearly data
  const baselineData = processYearlyData(projection.baseline_years, client, 'baseline');
  const formulaData = processYearlyData(projection.blueprint_years, client, 'formula');

  // Get conversion details (years with conversions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversionDetails: ConversionDetail[] = projection.blueprint_years
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((year: any) => year.conversionAmount > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((year: any, index: number) => {
      const prevYear = index > 0 ? projection.blueprint_years[index - 1] : null;
      const boyTraditional = prevYear
        ? prevYear.traditionalBalance
        : Math.round((client.qualified_account_value ?? 0) * (1 + (client.bonus_percent ?? 10) / 100));
      const boyRoth = prevYear ? prevYear.rothBalance : (client.roth_ira ?? 0);
      const boyCombined = boyTraditional + boyRoth;
      const eoyCombined = year.traditionalBalance + year.rothBalance;
      const interest = eoyCombined - boyCombined + year.conversionAmount;

      return {
        age: year.age,
        existingTaxable: formatCurrency(year.otherIncome),
        distribution: formatCurrency(year.conversionAmount),
        bracketCeiling: formatCurrency((client.max_tax_rate ?? 24) * 100000), // Simplified bracket ceiling
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
    lifetimeWealthChartImage: charts.lifetimeWealth,
    conversionChartImage: charts.conversion,
    baseline: {
      totalDistributions: formatCurrency(baseRMDs),
      totalConversions: formatCurrency(0),
      taxOnDistributions: formatCurrency(baseTax),
      taxOnConversions: formatCurrency(0),
      afterTaxDistributions: formatCurrency(baseAfterTaxDist),
      legacyGross: formatCurrency(baseFinalBalance),
      legacyTax: formatCurrency(baseLegacyTax),
      legacyNet: formatCurrency(baseNetLegacy),
      totalDist: formatCurrency(baseRMDs + baseFinalBalance),
      totalCosts: formatCurrency(baseTotalCosts),
      lifetimeWealth: formatCurrency(baseLifetimeWealth),
      ...baselineData,
    },
    formula: {
      totalDistributions: formatCurrency(0),
      totalConversions: formatCurrency(blueConversions),
      taxOnDistributions: formatCurrency(0),
      taxOnConversions: formatCurrency(blueTax),
      afterTaxDistributions: formatCurrency(0),
      legacyGross: formatCurrency(blueFinalBalance),
      legacyTax: formatCurrency(blueLegacyTax),
      legacyNet: formatCurrency(blueNetLegacy),
      totalDist: formatCurrency(blueFinalBalance),
      totalCosts: formatCurrency(blueTotalCosts),
      lifetimeWealth: formatCurrency(blueLifetimeWealth),
      ...formulaData,
    },
    diff: {
      // Raw values for use with formatDiff helper (cents)
      distributions: (blueConversions - baseRMDs) / 100,
      taxes: (blueTax - baseTax) / 100,
      afterTax: (0 - baseAfterTaxDist) / 100,
      legacyGross: (blueFinalBalance - baseFinalBalance) / 100,
      legacyTax: (blueLegacyTax - baseLegacyTax) / 100,
      legacyNet: (blueNetLegacy - baseNetLegacy) / 100,
      totalDist: (blueFinalBalance - (baseRMDs + baseFinalBalance)) / 100,
      totalCosts: (blueTotalCosts - baseTotalCosts) / 100,
    },
    conversionDetails,
    branding,
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
  const purchaseAmount = projection.gi_purchase_amount || client.qualified_account_value || 0;
  const bonusPercent = client.bonus_percent || 0;
  const bonusAmount = Math.round(purchaseAmount * (bonusPercent / 100));
  const startingIncomeBase = projection.gi_income_base_at_start || (purchaseAmount + bonusAmount);
  const finalIncomeBase = projection.gi_income_base_at_income_age || startingIncomeBase;
  const rollUpGrowth = finalIncomeBase - startingIncomeBase;
  const payoutPercent = projection.gi_payout_percent || 0;
  const calculatedIncome = Math.round(finalIncomeBase * (payoutPercent / 100));

  // Income calculations
  const strategyAnnualIncome = projection.gi_strategy_annual_income_net || projection.gi_annual_income_gross || 0;
  const baselineAnnualIncomeGross = projection.gi_baseline_annual_income_gross || 0;
  const baselineAnnualIncomeNet = projection.gi_baseline_annual_income_net || 0;
  const baselineAnnualTax = Math.round(baselineAnnualIncomeGross * flatTaxRate);
  const annualAdvantage = strategyAnnualIncome - baselineAnnualIncomeNet;

  const incomeStartAge = projection.gi_income_start_age || client.income_start_age || 70;
  const endAge = client.end_age || 100;
  const incomeYears = endAge - incomeStartAge + 1;

  // Lifetime income
  const strategyLifetimeIncome = projection.gi_total_net_paid || (strategyAnnualIncome * incomeYears);
  const baselineLifetimeIncome = baselineAnnualIncomeNet * incomeYears;
  const lifetimeIncomeAdvantage = strategyLifetimeIncome - baselineLifetimeIncome;

  // Taxes
  const conversionTax = projection.gi_total_conversion_tax || 0;
  const baselineTotalTaxes = baselineAnnualTax * incomeYears;
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
    riderFee: (client.rider_fee || 1.00).toFixed(2),
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

    const body = await request.json();
    const { reportData, charts } = body;

    if (!reportData || !reportData.client || !reportData.projection) {
      return NextResponse.json(
        { error: 'Missing required report data' },
        { status: 400 }
      );
    }

    // Fetch user settings for branding
    const { data: settings } = await supabase
      .from('user_settings')
      .select('company_name, tagline, company_phone, company_email, company_website, logo_url, primary_color, secondary_color')
      .eq('user_id', user.id)
      .single();

    const branding: BrandingData = {
      companyName: settings?.company_name || '',
      tagline: settings?.tagline || '',
      logoUrl: settings?.logo_url || '',
      phone: settings?.company_phone || '',
      email: settings?.company_email || '',
      website: settings?.company_website || '',
      primaryColor: settings?.primary_color || '#1a3a5c',
      secondaryColor: settings?.secondary_color || '#4ecdc4',
      hasBranding: !!(settings?.company_name || settings?.logo_url),
      hasContactInfo: !!(settings?.company_phone || settings?.company_email || settings?.company_website),
    };

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
      : prepareTemplateData(reportData, charts || {}, branding);

    // Generate HTML
    const html = template(templateData);

    // Configure Chromium for serverless environment
    const executablePath = await chromium.executablePath();

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Set content
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    // Generate PDF
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

    // Return PDF
    const clientName = reportData.client.name || 'Client';
    const sanitizedName = clientName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_');
    const pdfPrefix = isGI ? 'RothFormula_GI' : 'RothFormula';

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfPrefix}_${sanitizedName}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
