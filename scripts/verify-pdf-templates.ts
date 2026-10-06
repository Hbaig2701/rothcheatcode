/**
 * Compile + render every PDF template, with the advisory fee on, off, and
 * strategy-only. A handlebars block I unbalanced would break PDF generation for
 * EVERY advisor, and nothing else in the test suite touches the template.
 */
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';

let fails = 0;
const ck = (l: string, ok: boolean, d = '') => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); };

// Minimal stand-ins for the route's helpers so compile+render can run here.
for (const h of ['formatCurrency', 'redUnlessZero'] as const) Handlebars.registerHelper(h, (v: unknown) => String(v ?? ''));
Handlebars.registerHelper('pageHeader', (t: string) => new Handlebars.SafeString(`<div>${t}</div>`));
Handlebars.registerHelper('brandingFooter', () => new Handlebars.SafeString('<div></div>'));
Handlebars.registerHelper('formatDiff', (v: number) => new Handlebars.SafeString(String(v)));

const templates = ['pdf-template.html', 'gi-pdf-template.html', 'gi-legacy-pdf-template.html', 'story-pdf-template.html'];

// 1. Every template must COMPILE (catches unbalanced {{#if}}/{{/if}}).
const compiled: Record<string, HandlebarsTemplateDelegate> = {};
for (const t of templates) {
  try {
    compiled[t] = Handlebars.compile(readFileSync(`templates/${t}`, 'utf8'));
    ck(`${t}: compiles`, true);
  } catch (e) { ck(`${t}: compiles`, false, String(e).slice(0, 200)); }
}

// 2. Block balance, counted directly in the source.
for (const t of templates) {
  const src = readFileSync(`templates/${t}`, 'utf8');
  for (const b of ['if', 'unless', 'each', 'with'] as const) {
    const open = (src.match(new RegExp(`\\{\\{#${b}[\\s}]`, 'g')) ?? []).length;
    const close = (src.match(new RegExp(`\\{\\{/${b}\\}\\}`, 'g')) ?? []).length;
    if (open !== close) ck(`${t}: {{#${b}}} balanced`, false, `${open} open vs ${close} close`);
  }
}
ck('all templates: block tags balanced', fails === 0);

// 3. Render pdf-template.html in all three advisory-fee states.
const data = (over: Record<string, unknown>) => ({
  clientName: 'Test Client', clientAge: 65, filingStatus: 'Married Filing Jointly',
  initialDeposit: '$2,000,000', bonusRate: 0, rateOfReturn: 6, rateOfReturnPercent: '6',
  maxTaxRate: 24, state: 'CA', stateTaxRate: 0, stateTaxRatePercent: '0',
  heirTaxRatePercent: '40', lifetimeWealthBefore: '$1', lifetimeWealthAfter: '$2',
  wealthIncreasePercent: '1.00', aumGrowthDiffers: false, aumGrowthRatePercent: '6',
  baseline: { years: [], totals: {}, accountValuesTotals: {} },
  strategy: { years: [], totals: {}, accountValuesTotals: {} },
  years: [], glossary: [],
  // The glossary PAGE is gated on sections.glossary — without this the whole
  // page (and therefore the advisory-fee entry) is skipped.
  sections: { glossary: true, legacyComparison: true, rmdAvoidance: true },
  ...over,
});
const states: Array<[string, Record<string, unknown>]> = [
  ['fee OFF', { hasAdvisoryFee: false }],
  ['fee ON, both sides', { hasAdvisoryFee: true, advisoryFeePercent: '1', advisoryFeeInBaseline: true,
    advisoryFeeStrategyTotal: '$1,250,180', advisoryFeeBaselineTotal: '$1,511,667' }],
  ['fee ON, strategy only', { hasAdvisoryFee: true, advisoryFeePercent: '1', advisoryFeeInBaseline: false,
    advisoryFeeStrategyTotal: '$1,250,180', advisoryFeeBaselineTotal: '$0' }],
  ['fields entirely absent (old cached data)', {}],
  ['managed Roth, rates match', { hasManagedRoth: true, managedRothPercent: '40',
    managedRothRatePercent: '6', managedRothFinalBalance: '$2,729,132',
    aumGrowthDiffers: false, baselineRatePercent: '6' }],
  ['managed Roth, rates DIFFER (must warn)', { hasManagedRoth: true, managedRothPercent: '40',
    managedRothRatePercent: '9', managedRothFinalBalance: '$5,986,416',
    aumGrowthDiffers: true, aumGrowthDiffersIsManagedRoth: true,
    baselineRatePercent: '6' }],
  ['taxable AUM, rates differ', { aumGrowthDiffers: true,
    aumGrowthDiffersIsManagedRoth: false, aumGrowthRatePercent: '9', baselineRatePercent: '6' }],
];
for (const [name, over] of states) {
  try {
    const html = compiled['pdf-template.html'](data(over));
    const showsRow = html.includes('Annual Advisory Fee');
    const showsGloss = html.includes('Advisory Fee (');
    const expect = !!over.hasAdvisoryFee;
    ck(`render "${name}": renders`, html.length > 1000, `${html.length} chars`);
    ck(`render "${name}": advisory row ${expect ? 'shown' : 'hidden'}`, showsRow === expect);
    ck(`render "${name}": glossary ${expect ? 'shown' : 'hidden'}`, showsGloss === expect);
    if (expect) {
      const both = html.includes('<strong>both</strong>');
      const only = html.includes('<strong>strategy only</strong>');
      const wantBoth = over.advisoryFeeInBaseline === true;
      ck(`render "${name}": correct wording branch`, both === wantBoth && only === !wantBoth,
        `both=${both} only=${only}`);
    }
    // Managed-Roth block + the return-asymmetry warning.
    const wantManaged = !!over.hasManagedRoth;
    ck(`render "${name}": managed-Roth glossary ${wantManaged ? 'shown' : 'hidden'}`,
      html.includes('Managed Roth Allocation') === wantManaged);
    if (over.aumGrowthDiffers) {
      ck(`render "${name}": names the right managed account`,
        over.aumGrowthDiffersIsManagedRoth
          ? html.includes('managed Roth sleeve in the strategy')
          : html.includes('managed (AUM) brokerage account in the strategy'));
      ck(`render "${name}": states the return difference is not tax planning`,
        html.includes('rather than\n        from tax planning') || html.includes('rather than'));
    }
    if (html.includes('{{') || html.includes('[object Object]')) {
      ck(`render "${name}": no unresolved tokens`, false, 'template leaked {{ }} or [object Object]');
    }
  } catch (e) { ck(`render "${name}"`, false, String(e).slice(0, 200)); }
}

console.log(`\n${fails === 0 ? 'TEMPLATES OK' : `${fails} ISSUE(S)`}\n`);
process.exit(fails === 0 ? 0 : 1);
