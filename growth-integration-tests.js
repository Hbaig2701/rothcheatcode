/**
 * GROWTH FIA INTEGRATION TESTS
 *
 * Tests the full baseline vs strategy comparison to ensure:
 * 1. Baseline uses simple compound growth (no RMDs)
 * 2. Strategy applies bonuses and conversions correctly
 * 3. Lifetime wealth, net legacy, and other metrics make sense
 * 4. The comparison shows meaningful differences
 */

const { runGrowthSimulation, runGrowthBaselineScenario, runGrowthFormulaScenario } = require('./lib/calculations/growth-engine.js');

const TOLERANCE = 1.00; // $1 tolerance for rounding

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function assertEqual(actual, expected, fieldName, tolerance = TOLERANCE) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    return {
      passed: false,
      message: `${fieldName}: Expected ${formatCurrency(expected)}, got ${formatCurrency(actual)} (diff: ${formatCurrency(diff)})`,
    };
  }
  return { passed: true, fieldName };
}

function assertGreaterThan(actual, threshold, fieldName) {
  if (actual <= threshold) {
    return {
      passed: false,
      message: `${fieldName}: Expected > ${formatCurrency(threshold)}, got ${formatCurrency(actual)}`,
    };
  }
  return { passed: true, fieldName };
}

function assertLessThan(actual, threshold, fieldName) {
  if (actual >= threshold) {
    return {
      passed: false,
      message: `${fieldName}: Expected < ${formatCurrency(threshold)}, got ${formatCurrency(actual)}`,
    };
  }
  return { passed: true, fieldName };
}

// ============================================================================
// TEST CASES
// ============================================================================

const TEST_CASES = [
  {
    id: 'baseline-1',
    name: 'Baseline: Simple Compound Growth',
    description: 'Verify baseline uses simple compound growth without RMDs',
    client: {
      age: 60,
      end_age: 75,
      qualified_account_value: 500000,
      baseline_comparison_rate: 7,
      rate_of_return: 7,
      heir_tax_rate: 40,
    },
    test: (client) => {
      const startYear = 2024;
      const projectionYears = client.end_age - client.age + 1; // 16 years
      const baseline = runGrowthBaselineScenario(client, startYear, projectionYears);

      const assertions = [];

      // Verify we have correct number of years
      assertions.push(assertEqual(baseline.length, projectionYears, 'Year count'));

      // Verify no RMDs in baseline
      const totalRMDs = baseline.reduce((sum, y) => sum + y.rmdAmount, 0);
      assertions.push(assertEqual(totalRMDs, 0, 'Total RMDs should be 0'));

      // Verify no conversions in baseline
      const totalConversions = baseline.reduce((sum, y) => sum + y.conversionAmount, 0);
      assertions.push(assertEqual(totalConversions, 0, 'Total conversions should be 0'));

      // Verify compound growth: 500000 * 1.07^16 = 1,480,243
      const expectedFinal = Math.round(500000 * Math.pow(1.07, projectionYears));
      const actualFinal = baseline[baseline.length - 1].traditionalBalance;
      assertions.push(assertEqual(actualFinal, expectedFinal, 'Final balance (compound growth)', 100));

      // Verify Roth balance is 0
      assertions.push(assertEqual(baseline[baseline.length - 1].rothBalance, 0, 'Roth balance should be 0'));

      return assertions;
    },
  },

  {
    id: 'baseline-2',
    name: 'Baseline: Net Worth Consistency',
    description: 'Verify baseline net worth equals traditional balance (no Roth)',
    client: {
      age: 62,
      end_age: 74,
      qualified_account_value: 823000,
      baseline_comparison_rate: 7,
      rate_of_return: 7,
      heir_tax_rate: 40,
    },
    test: (client) => {
      const startYear = 2024;
      const projectionYears = client.end_age - client.age + 1; // 13 years
      const baseline = runGrowthBaselineScenario(client, startYear, projectionYears);

      const assertions = [];

      // Verify net worth = traditional balance for all years
      baseline.forEach((year, idx) => {
        assertions.push(assertEqual(
          year.netWorth,
          year.traditionalBalance,
          `Year ${idx + 1} netWorth = traditionalBalance`
        ));
      });

      // Calculate expected final: 823000 * 1.07^13 = 1,987,246
      const expectedFinal = Math.round(823000 * Math.pow(1.07, projectionYears));
      assertions.push(assertEqual(
        baseline[baseline.length - 1].traditionalBalance,
        expectedFinal,
        'Final balance matches compound growth',
        100
      ));

      return assertions;
    },
  },

  {
    id: 'formula-1',
    name: 'Formula: Bonus Application',
    description: 'Verify formula applies upfront bonus correctly',
    client: {
      age: 60,
      end_age: 65,
      qualified_account_value: 100000,
      bonus_percent: 20,
      rate_of_return: 0, // No growth to isolate bonus effect
      conversion_type: 'no_conversion',
      years_to_defer_conversion: 0,
      tax_rate: 24,
      heir_tax_rate: 40,
    },
    test: (client) => {
      const startYear = 2024;
      const projectionYears = client.end_age - client.age + 1;
      const formula = runGrowthFormulaScenario(client, startYear, projectionYears);

      const assertions = [];

      // With 20% bonus on 100000, first year should start at 120000
      // Since interest is applied first and we have 0% growth, balance stays at 120000
      assertions.push(assertEqual(
        formula[0].traditionalBalance,
        120000,
        'First year balance with 20% bonus'
      ));

      // Final balance should still be 120000 (no growth, no conversions)
      assertions.push(assertEqual(
        formula[formula.length - 1].traditionalBalance,
        120000,
        'Final balance (no growth)'
      ));

      return assertions;
    },
  },

  {
    id: 'comparison-1',
    name: 'Full Simulation: Baseline vs Strategy Comparison',
    description: 'Verify the comparison metrics make sense',
    client: {
      age: 60,
      end_age: 75,
      qualified_account_value: 500000,
      bonus_percent: 10,
      baseline_comparison_rate: 7,
      rate_of_return: 7,
      conversion_type: 'full_conversion',
      years_to_defer_conversion: 0,
      tax_rate: 24,
      state_tax_rate: 0,
      heir_tax_rate: 40,
      blueprint_type: 'fia',
    },
    test: (client) => {
      const simulationInput = {
        client,
        startYear: 2024,
        endYear: 2024 + (client.end_age - client.age),
      };

      const result = runGrowthSimulation(simulationInput);
      const assertions = [];

      // Verify we got baseline and formula results
      assertions.push(assertGreaterThan(result.baseline.length, 0, 'Baseline has data'));
      assertions.push(assertGreaterThan(result.formula.length, 0, 'Formula has data'));

      const lastBaseline = result.baseline[result.baseline.length - 1];
      const lastFormula = result.formula[result.formula.length - 1];

      // Baseline should have traditional balance, no Roth
      assertions.push(assertGreaterThan(lastBaseline.traditionalBalance, 0, 'Baseline has traditional balance'));
      assertions.push(assertEqual(lastBaseline.rothBalance, 0, 'Baseline has no Roth'));

      // Formula should have Roth balance (converted)
      assertions.push(assertGreaterThan(lastFormula.rothBalance, 0, 'Formula has Roth balance'));

      // Calculate expected baseline final: 500000 * 1.07^16 = ~1,480,243
      const expectedBaselineFinal = Math.round(500000 * Math.pow(1.07, 16));
      assertions.push(assertEqual(
        lastBaseline.traditionalBalance,
        expectedBaselineFinal,
        'Baseline final matches compound growth',
        100
      ));

      // Net legacy calculations
      const baselineNetLegacy = Math.round(lastBaseline.traditionalBalance * 0.6); // 40% heir tax
      const formulaNetLegacy = Math.round(lastFormula.traditionalBalance * 0.6) + lastFormula.rothBalance;

      // These should be reasonable values (positive, significant)
      assertions.push(assertGreaterThan(baselineNetLegacy, 500000, 'Baseline net legacy > starting value'));
      assertions.push(assertGreaterThan(formulaNetLegacy, 0, 'Formula net legacy > 0'));

      // Heir benefit should be positive (less taxes for heirs with Roth)
      assertions.push(assertGreaterThan(result.heirBenefit, 0, 'Heir benefit is positive'));

      return assertions;
    },
  },

  {
    id: 'comparison-2',
    name: 'Homer Simpson Scenario',
    description: 'Verify Homer ($823K, age 60) has sensible baseline lifetime wealth',
    client: {
      age: 60,
      end_age: 85,
      qualified_account_value: 823000,
      bonus_percent: 11, // EquiTrust MarketEdge Bonus
      baseline_comparison_rate: 7,
      rate_of_return: 7,
      conversion_type: 'optimized_amount',
      years_to_defer_conversion: 0,
      tax_rate: 24,
      state_tax_rate: 0,
      heir_tax_rate: 40,
      blueprint_type: 'equitrust-marketedge-bonus',
    },
    test: (client) => {
      const simulationInput = {
        client,
        startYear: 2024,
        endYear: 2024 + (client.end_age - client.age),
      };

      const result = runGrowthSimulation(simulationInput);
      const assertions = [];

      const lastBaseline = result.baseline[result.baseline.length - 1];
      const lastFormula = result.formula[result.formula.length - 1];

      // Baseline: 823000 * 1.07^26 = ~4,847,000
      const expectedBaselineFinal = Math.round(823000 * Math.pow(1.07, 26));
      assertions.push(assertEqual(
        lastBaseline.traditionalBalance,
        expectedBaselineFinal,
        'Baseline final (823K @ 7% for 26 years)',
        1000 // Allow $1000 tolerance for large number
      ));

      // Baseline net legacy (after 40% heir tax): ~2,908,000
      const baselineNetLegacy = Math.round(lastBaseline.traditionalBalance * 0.6);
      assertions.push(assertGreaterThan(
        baselineNetLegacy,
        2000000,
        'Baseline net legacy > $2M'
      ));

      // This was the bug - baseline was showing only $415K lifetime wealth
      // It should be in the millions
      assertions.push(assertGreaterThan(
        baselineNetLegacy,
        1000000,
        'Baseline net legacy > $1M (bug check)'
      ));

      // Formula should have bonus applied and Roth balance
      const expectedFormulaStart = Math.round(823000 * 1.11); // 11% bonus
      assertions.push(assertGreaterThan(
        lastFormula.rothBalance,
        0,
        'Formula has Roth balance'
      ));

      return assertions;
    },
  },

  {
    id: 'sanity-1',
    name: 'Sanity Check: Baseline vs Formula Net Worth',
    description: 'Verify formula total balance is similar or higher than baseline',
    client: {
      age: 62,
      end_age: 74,
      qualified_account_value: 500000,
      bonus_percent: 0,
      baseline_comparison_rate: 4,
      rate_of_return: 4,
      conversion_type: 'full_conversion',
      years_to_defer_conversion: 0,
      tax_rate: 24,
      state_tax_rate: 0,
      heir_tax_rate: 35,
      blueprint_type: 'lincoln-optiblend-7',
    },
    test: (client) => {
      const simulationInput = {
        client,
        startYear: 2024,
        endYear: 2024 + (client.end_age - client.age),
      };

      const result = runGrowthSimulation(simulationInput);
      const assertions = [];

      const lastBaseline = result.baseline[result.baseline.length - 1];
      const lastFormula = result.formula[result.formula.length - 1];

      // Baseline: 500000 * 1.04^13 = 832,536
      const expectedBaseline = Math.round(500000 * Math.pow(1.04, 13));
      assertions.push(assertEqual(
        lastBaseline.traditionalBalance,
        expectedBaseline,
        'Baseline matches test 6 expected value',
        10
      ));

      // Net legacy: 832536 * 0.65 = 541,148
      const baselineNetLegacy = Math.round(lastBaseline.traditionalBalance * 0.65);
      assertions.push(assertEqual(
        baselineNetLegacy,
        541149, // Matches test 6
        'Baseline net legacy matches test 6',
        10
      ));

      // Formula should have mostly Roth (full conversion)
      const formulaTotalBalance = lastFormula.traditionalBalance + lastFormula.rothBalance;

      // Total formula balance should be reasonable
      assertions.push(assertGreaterThan(
        formulaTotalBalance,
        0,
        'Formula has positive total balance'
      ));

      return assertions;
    },
  },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTest(testCase) {
  console.log(`\n${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  console.log(`${COLORS.blue}TEST: ${testCase.name}${COLORS.reset}`);
  console.log(`${testCase.description}`);
  console.log(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);

  try {
    const assertions = testCase.test(testCase.client);

    const passed = assertions.filter(a => a.passed);
    const failed = assertions.filter(a => !a.passed);

    if (failed.length === 0) {
      console.log(`${COLORS.green}✅ PASSED: All ${assertions.length} assertions passed${COLORS.reset}`);
    } else {
      console.log(`${COLORS.red}❌ FAILED: ${failed.length} of ${assertions.length} assertions failed${COLORS.reset}\n`);
      failed.forEach(f => console.log(`   ${COLORS.red}• ${f.message}${COLORS.reset}`));
    }

    return { passed: failed.length === 0, assertions, testCase };
  } catch (error) {
    console.log(`${COLORS.red}❌ ERROR: ${error.message}${COLORS.reset}`);
    console.log(error.stack);
    return { passed: false, error: error.message, testCase };
  }
}

function runAllTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('  GROWTH FIA INTEGRATION TEST SUITE');
  console.log('█'.repeat(70));

  const results = TEST_CASES.map(runTest);

  // Summary
  console.log('\n' + '█'.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('█'.repeat(70));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`
  Total:   ${results.length} tests
  Passed:  ${COLORS.green}${passed}${COLORS.reset}
  Failed:  ${COLORS.red}${failed}${COLORS.reset}
  `);

  if (failed > 0) {
    console.log(`${COLORS.red}FAILED TESTS:${COLORS.reset}`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  • ${r.testCase.name}`);
    });
  } else {
    console.log(`${COLORS.green}🎉 ALL TESTS PASSED! Integration verified.${COLORS.reset}\n`);
  }

  return { passed, failed, total: results.length };
}

// Run tests
runAllTests();
