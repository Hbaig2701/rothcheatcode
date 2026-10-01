import type { PrepFacts, PrepInput } from './types';
import { isNoAnnuityProduct } from '@/lib/config/products';

/**
 * Build the fact sheet from a finished projection.
 *
 * THE ACCURACY RULE: this file READS the projection and does nothing else.
 * The only arithmetic permitted here is summing or differencing values the
 * report itself already displays (lifetime totals, baseline-vs-strategy
 * deltas). No tax logic, no bracket lookups, no re-deriving a figure the
 * engine already produced.
 *
 * That is what makes the brief trustworthy: it cannot disagree with the
 * report, because it has no independent opinion. If a number here is wrong,
 * the same wrong number is on the report, which is a different bug with its
 * own test suite. We learned this the hard way — the heir-tax formula was
 * copy-pasted to 33 call sites and the senior deduction was computed one way
 * in the engine and another in the PDF.
 */
export function computePrepFacts(input: PrepInput): PrepFacts {
  const { client: c, baseline: B, formula: F, taxPaybackAge } = input;
  const lastB = B[B.length - 1];
  const lastF = F[F.length - 1];
  const heirRate = (c.heir_tax_rate ?? 40) / 100;

  const sum = (rows: typeof B, pick: (y: (typeof B)[number]) => number) =>
    rows.reduce((s, y) => s + (pick(y) || 0), 0);

  const baselineHeirTax = Math.round(lastB.traditionalBalance * heirRate);
  const baselineNetLegacy = lastB.netWorth - baselineHeirTax;
  const strategyNetLegacy =
    lastF.netWorth - Math.round(lastF.traditionalBalance * heirRate);

  const convRows = F.filter((y) => y.conversionAmount > 0);
  const convTaxOf = (y: (typeof F)[number]) =>
    (y.federalTaxOnConversions ?? 0) + (y.stateTaxOnConversions ?? 0);
  const worstYear = convRows.reduce<(typeof F)[number] | null>(
    (m, y) => (convTaxOf(y) > (m ? convTaxOf(m) : -1) ? y : m),
    null,
  );

  const firstRmd = B.find((y) => y.rmdAmount > 0) ?? null;
  const peakRmd = B.reduce<(typeof B)[number] | null>(
    (m, y) => (y.rmdAmount > (m?.rmdAmount ?? -1) ? y : m),
    null,
  );

  const baselineLifetimeTax = sum(B, (y) => y.totalTax);
  const strategyLifetimeTax = sum(F, (y) => y.totalTax);
  const drained = F.find((y) => y.traditionalBalance === 0) ?? null;

  const worstTier = (rows: typeof B) =>
    rows.reduce((m, y) => Math.max(m, y.irmaaTier ?? 0), 0);

  // Where does the family actually end up ahead? Scan from the END so we report
  // the age it STAYS ahead from, not the first time the lines happen to touch.
  // A plan can lead for twenty years and still finish behind (conversion taxes
  // compounding against a larger untouched IRA) — reporting that first crossing
  // as "ahead from day one" next to a headline saying the family ends up
  // millions behind is exactly the contradiction this brief must never print.
  const series = input.legacySeries;
  const last = series[series.length - 1];
  const aheadAtEnd = !!last && last.formula >= last.baseline;
  let legacyCrossoverAge: number | null = null;
  let legacyFallsBehindAge: number | null = null;
  if (series.length) {
    if (aheadAtEnd) {
      let i = series.length - 1;
      while (i >= 0 && series[i].formula >= series[i].baseline) i--;
      legacyCrossoverAge = series[i + 1]?.age ?? null;
    } else {
      let i = series.length - 1;
      while (i >= 0 && series[i].formula < series[i].baseline) i--;
      legacyFallsBehindAge = series[i + 1]?.age ?? null;
    }
  }

  const fullName = (c.name ?? 'this client').trim();
  return {
    name: fullName,
    firstName: fullName.split(/\s+/)[0] || fullName,
    age: c.age ?? 0,
    spouseAge: c.spouse_age ?? null,
    filing: c.filing_status ?? 'single',
    state: c.state ?? '',
    endAge: c.end_age ?? 0,
    isMarried: c.filing_status === 'married_filing_jointly',

    ira: c.qualified_account_value ?? 0,
    roth: c.roth_ira ?? 0,
    taxable: c.taxable_accounts ?? 0,

    conversionType: c.conversion_type ?? 'optimized_amount',
    bracketCeiling: c.max_tax_rate ?? null,
    taxFromIra: c.tax_payment_source === 'from_ira',
    productName: c.product_name ?? null,
    isNoAnnuity: isNoAnnuityProduct(c.blueprint_type),

    baselineNetLegacy,
    strategyNetLegacy,
    legacyGain: strategyNetLegacy - baselineNetLegacy,
    legacyGainPct:
      baselineNetLegacy > 0
        ? ((strategyNetLegacy - baselineNetLegacy) / baselineNetLegacy) * 100
        : 0,

    conversionTaxTotal: sum(F, convTaxOf),
    conversionYears: convRows.length,
    conversionFirstAge: convRows[0]?.age ?? null,
    conversionLastAge: convRows[convRows.length - 1]?.age ?? null,
    worstYearTax: worstYear ? convTaxOf(worstYear) : 0,
    worstYearAge: worstYear?.age ?? null,
    taxPaybackAge,
    legacyCrossoverAge,
    legacyFallsBehindAge,
    aheadAtEnd,

    firstRmdAge: firstRmd?.age ?? null,
    firstRmdAmount: firstRmd?.rmdAmount ?? 0,
    peakRmdAmount: peakRmd?.rmdAmount ?? 0,
    peakRmdAge: peakRmd?.age ?? null,
    baselineLifetimeTax,
    strategyLifetimeTax,
    lifetimeTaxSaved: baselineLifetimeTax - strategyLifetimeTax,
    heirRatePct: heirRate * 100,
    baselineFinalTraditional: lastB.traditionalBalance,
    baselineHeirTax,

    baselineIrmaaTotal: sum(B, (y) => y.irmaaSurcharge ?? 0),
    strategyIrmaaTotal: sum(F, (y) => y.irmaaSurcharge ?? 0),
    baselineWorstTier: worstTier(B),
    strategyWorstTier: worstTier(F),

    yearsOfRunway: Math.max(0, (firstRmd?.age ?? 0) - (c.age ?? 0)),
    alreadyPastRmdAge: firstRmd ? firstRmd.age <= (c.age ?? 0) : false,
    iraFullyConvertedByAge: drained?.age ?? null,
    strategyFinalTraditional: lastF.traditionalBalance,

    widowExtraTax: input.widowExtraTax ?? null,
  };
}
