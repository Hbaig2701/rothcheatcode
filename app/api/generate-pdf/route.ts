import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for PDF generation

// Register Handlebars helpers
Handlebars.registerHelper('formatCurrency', (value: number) => {
  if (value === 0) return '$0';
  return '$' + new Intl.NumberFormat('en-US').format(Math.round(value));
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
  blueprint: ScenarioData;
  diff: {
    distributions: string;
    taxes: string;
    afterTax: string;
    legacyGross: string;
    legacyTax: string;
    legacyNet: string;
    totalDist: string;
    totalCosts: string;
  };
  conversionDetails: ConversionDetail[];
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
function processYearlyData(years: any[], client: any, scenario: 'baseline' | 'blueprint'): {
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
      : scenario === 'blueprint'
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
      (scenario === 'blueprint' ? year.conversionAmount : 0);

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
function prepareTemplateData(reportData: any, charts: { lifetimeWealth?: string; conversion?: string }): TemplateData {
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

  // Blueprint metrics
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
  const blueprintData = processYearlyData(projection.blueprint_years, client, 'blueprint');

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
    blueprint: {
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
      ...blueprintData,
    },
    diff: {
      distributions: formatCurrency(blueConversions - baseRMDs),
      taxes: formatCurrency(blueTax - baseTax),
      afterTax: formatCurrency(0 - baseAfterTaxDist),
      legacyGross: formatCurrency(blueFinalBalance - baseFinalBalance),
      legacyTax: formatCurrency(blueLegacyTax - baseLegacyTax),
      legacyNet: formatCurrency(blueNetLegacy - baseNetLegacy),
      totalDist: formatCurrency(blueFinalBalance - (baseRMDs + baseFinalBalance)),
      totalCosts: formatCurrency(blueTotalCosts - baseTotalCosts),
    },
    conversionDetails,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportData, charts } = body;

    if (!reportData || !reportData.client || !reportData.projection) {
      return NextResponse.json(
        { error: 'Missing required report data' },
        { status: 400 }
      );
    }

    // Load and compile template
    const templatePath = path.join(process.cwd(), 'templates', 'pdf-template.html');
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    const template = Handlebars.compile(templateHtml);

    // Prepare data for template
    const templateData = prepareTemplateData(reportData, charts || {});

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

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="RothBlueprint_${sanitizedName}.pdf"`,
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
