/**
 * Growth FIA Simulation Engine - JavaScript version for testing
 */

const { runGrowthBaselineScenario } = require('./scenarios/growth-baseline.js');
const { runGrowthFormulaScenario } = require('./scenarios/growth-formula.js');

const DEFAULT_HEIR_TAX_RATE = 40;

function calculateBreakEvenAge(baseline, formula) {
  for (let i = 0; i < baseline.length && i < formula.length; i++) {
    if (formula[i].netWorth > baseline[i].netWorth) {
      return formula[i].age;
    }
  }
  return null;
}

function calculateTaxSavings(baseline, formula) {
  const formulaTotalTax = formula.reduce((sum, y) => sum + y.totalTax, 0);
  return -formulaTotalTax;
}

function calculateHeirBenefit(baseline, formula, heirTaxRate) {
  const lastBaseline = baseline[baseline.length - 1];
  const lastFormula = formula[formula.length - 1];

  const heirRate = heirTaxRate / 100;

  const baselineHeirTax = Math.round(lastBaseline.traditionalBalance * heirRate);
  const formulaHeirTax = Math.round(lastFormula.traditionalBalance * heirRate);

  return baselineHeirTax - formulaHeirTax;
}

function runGrowthSimulation(input) {
  const { client, startYear, endYear } = input;
  const projectionYears = endYear - startYear + 1;

  const baseline = runGrowthBaselineScenario(client, startYear, projectionYears);
  const formula = runGrowthFormulaScenario(client, startYear, projectionYears);

  const heirTaxRate = client.heir_tax_rate ?? DEFAULT_HEIR_TAX_RATE;

  return {
    baseline,
    formula,
    breakEvenAge: calculateBreakEvenAge(baseline, formula),
    totalTaxSavings: calculateTaxSavings(baseline, formula),
    heirBenefit: calculateHeirBenefit(baseline, formula, heirTaxRate)
  };
}

module.exports = { runGrowthSimulation, runGrowthBaselineScenario, runGrowthFormulaScenario };
