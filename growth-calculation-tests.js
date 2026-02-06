/**
 * GROWTH PRODUCTS CALCULATION TEST RUNNER
 * 
 * INSTRUCTIONS FOR CLAUDE CODE:
 * 
 * 1. Find the calculation function in this codebase that handles Growth FIA projections
 * 2. Update the import/require statement below to point to that function
 * 3. Run this file: node growth-calculation-tests.js
 * 4. Fix any failing tests by modifying the calculation logic
 * 5. Re-run until all tests pass
 * 
 * DO NOT MODIFY THE EXPECTED VALUES - THEY ARE MATHEMATICALLY VERIFIED
 */

// ============================================================================
// STEP 1: UPDATE THIS IMPORT TO YOUR ACTUAL CALCULATION FUNCTION
// ============================================================================

/*
 * TODO: Replace this with your actual import. Examples:
 * 
 * const { calculateGrowthProjection } = require('./src/calculations/growthEngine');
 * const { runProjection } = require('./lib/formulas');
 * import { calculateProjection } from './calculations';
 * 
 * The function should accept inputs and return yearly data with at minimum:
 * - accountValueEOY (or equivalent field name)
 * - surrenderValue (or equivalent)
 * - rothBalance (for conversion tests)
 */

let calculateGrowthProjection;

try {
  // Import from Growth FIA calculation module
  const growthFia = require('./lib/calculations/growth-fia.js');
  calculateGrowthProjection = growthFia.calculateGrowthProjection;
} catch (e) {
  console.log('Import error:', e.message);
  calculateGrowthProjection = null;
}

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TOLERANCE = 1.00; // Allow $1 difference for floating point rounding

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// ============================================================================
// PRODUCT CONFIGS (Use these or your actual configs)
// ============================================================================

const PRODUCTS = {
  'lincoln-optiblend-7': {
    id: 'lincoln-optiblend-7',
    carrier: 'Lincoln Financial',
    product: 'OptiBlend 7',
    surrenderYears: 7,
    surrenderSchedule: [9, 8, 7, 6, 5, 4, 3],
    bonus: 0,
    bonusSchedule: null,
  },
  'equitrust-marketedge-bonus': {
    id: 'equitrust-marketedge-bonus',
    carrier: 'EquiTrust',
    product: 'MarketEdge Bonus Index',
    surrenderYears: 10,
    surrenderSchedule: [16, 14.5, 13, 11.5, 9.5, 8, 6.5, 5, 3, 1],
    bonus: 20,
    bonusSchedule: [
      { timing: 'issue', percentage: 8 },
      { timing: 'anniversary1', percentage: 4 },
      { timing: 'anniversary2', percentage: 4 },
      { timing: 'anniversary3', percentage: 4 },
    ],
  },
};

// ============================================================================
// TEST CASES WITH EXPECTED VALUES
// ============================================================================

const TEST_CASES = [
  {
    id: 'test-1',
    name: 'Lincoln OptiBlend 7 - No Growth',
    description: 'Verify surrender value calculation with 0% growth',
    inputs: {
      product: 'lincoln-optiblend-7',
      clientAge: 60,
      qualifiedAccountValue: 100000,
      rateOfReturn: 0,
      endAge: 70,
      conversionType: 'none',
    },
    expectedYearlyData: [
      { year: 1, accountValueEOY: 100000.00, surrenderValue: 91000.00 },
      { year: 2, accountValueEOY: 100000.00, surrenderValue: 92000.00 },
      { year: 3, accountValueEOY: 100000.00, surrenderValue: 93000.00 },
      { year: 4, accountValueEOY: 100000.00, surrenderValue: 94000.00 },
      { year: 5, accountValueEOY: 100000.00, surrenderValue: 95000.00 },
      { year: 6, accountValueEOY: 100000.00, surrenderValue: 96000.00 },
      { year: 7, accountValueEOY: 100000.00, surrenderValue: 97000.00 },
      { year: 8, accountValueEOY: 100000.00, surrenderValue: 100000.00 },
      { year: 9, accountValueEOY: 100000.00, surrenderValue: 100000.00 },
      { year: 10, accountValueEOY: 100000.00, surrenderValue: 100000.00 },
    ],
    expectedSummary: {
      finalAccountValue: 100000.00,
      totalInterestEarned: 0,
      totalBonusesReceived: 0,
    },
  },
  
  {
    id: 'test-2',
    name: 'Lincoln OptiBlend 7 - 5% Growth',
    description: 'Verify compound growth calculation',
    inputs: {
      product: 'lincoln-optiblend-7',
      clientAge: 60,
      qualifiedAccountValue: 100000,
      rateOfReturn: 5,
      endAge: 70,
      conversionType: 'none',
    },
    expectedYearlyData: [
      { year: 1, accountValueEOY: 105000.00, surrenderValue: 95550.00 },
      { year: 2, accountValueEOY: 110250.00, surrenderValue: 101430.00 },
      { year: 3, accountValueEOY: 115762.50, surrenderValue: 107658.93 },
      { year: 4, accountValueEOY: 121550.63, surrenderValue: 114257.59 },
      { year: 5, accountValueEOY: 127628.16, surrenderValue: 121246.75 },
      { year: 6, accountValueEOY: 134009.56, surrenderValue: 128649.18 },
      { year: 7, accountValueEOY: 140710.04, surrenderValue: 136488.74 },
      { year: 8, accountValueEOY: 147745.54, surrenderValue: 147745.54 },
      { year: 9, accountValueEOY: 155132.82, surrenderValue: 155132.82 },
      { year: 10, accountValueEOY: 162889.46, surrenderValue: 162889.46 },
    ],
    expectedSummary: {
      finalAccountValue: 162889.46,
      totalInterestEarned: 62889.46,
      totalBonusesReceived: 0,
    },
  },
  
  {
    id: 'test-3',
    name: 'EquiTrust MarketEdge Bonus - No Growth',
    description: 'Verify bonus schedule (8% upfront + 4% x 3 anniversaries)',
    inputs: {
      product: 'equitrust-marketedge-bonus',
      clientAge: 60,
      qualifiedAccountValue: 100000,
      rateOfReturn: 0,
      endAge: 71,
      conversionType: 'none',
    },
    expectedYearlyData: [
      { year: 1, accountValueEOY: 112320.00, anniversaryBonus: 4320.00, surrenderValue: 94348.80 },
      { year: 2, accountValueEOY: 116812.80, anniversaryBonus: 4492.80, surrenderValue: 99875.04 },
      { year: 3, accountValueEOY: 121485.31, anniversaryBonus: 4672.51, surrenderValue: 105692.22 },
      { year: 4, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 107514.50 },
      { year: 5, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 109944.21 },
      { year: 6, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 111766.49 },
      { year: 7, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 113588.77 },
      { year: 8, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 115411.04 },
      { year: 9, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 117840.75 },
      { year: 10, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 120270.46 },
      { year: 11, accountValueEOY: 121485.31, anniversaryBonus: 0, surrenderValue: 121485.31 },
    ],
    expectedSummary: {
      finalAccountValue: 121485.31,
      totalInterestEarned: 0,
      totalBonusesReceived: 21485.31,
    },
  },
  
  {
    id: 'test-4',
    name: 'EquiTrust MarketEdge Bonus - 4% Growth',
    description: 'Verify bonus + growth interaction',
    inputs: {
      product: 'equitrust-marketedge-bonus',
      clientAge: 60,
      qualifiedAccountValue: 100000,
      rateOfReturn: 4,
      endAge: 71,
      conversionType: 'none',
    },
    expectedYearlyData: [
      { year: 1, accountValueEOY: 116812.80 },
      { year: 2, accountValueEOY: 126344.72 },
      { year: 3, accountValueEOY: 136654.45 },
      { year: 4, accountValueEOY: 142120.63 },
      { year: 5, accountValueEOY: 147805.46 },
      { year: 6, accountValueEOY: 153717.68 },
      { year: 7, accountValueEOY: 159866.39 },
      { year: 8, accountValueEOY: 166261.05 },
      { year: 9, accountValueEOY: 172911.49 },
      { year: 10, accountValueEOY: 179827.95 },
      { year: 11, accountValueEOY: 187021.07 },
    ],
    expectedSummary: {
      finalAccountValue: 187021.07,
    },
  },
  
  {
    id: 'test-5',
    name: 'Lincoln with Roth Conversions',
    description: 'Verify conversion deduction from IRA and Roth balance tracking',
    inputs: {
      product: 'lincoln-optiblend-7',
      clientAge: 62,
      qualifiedAccountValue: 500000,
      rateOfReturn: 4,
      endAge: 74,
      conversionType: 'fixed',
      conversionAmount: 100000,
      conversionStartAge: 62,
      conversionEndAge: 66,
      federalTaxRate: 24,
      stateTaxRate: 0,
      heirTaxRate: 35,
    },
    expectedYearlyData: [
      { year: 1, age: 62, accountValueEOY: 420000, rothBalance: 100000 },
      { year: 2, age: 63, accountValueEOY: 336800, rothBalance: 204000 },
      { year: 3, age: 64, accountValueEOY: 250272, rothBalance: 312160 },
      { year: 4, age: 65, accountValueEOY: 160283, rothBalance: 424646 },
      { year: 5, age: 66, accountValueEOY: 66694, rothBalance: 541632 },
      { year: 6, age: 67, accountValueEOY: 69362, rothBalance: 563297 },
      { year: 7, age: 68, accountValueEOY: 72136, rothBalance: 585829 },
      { year: 8, age: 69, accountValueEOY: 75021, rothBalance: 609262 },
      { year: 9, age: 70, accountValueEOY: 78022, rothBalance: 633632 },
      { year: 10, age: 71, accountValueEOY: 81143, rothBalance: 658977 },
      { year: 11, age: 72, accountValueEOY: 84389, rothBalance: 685336 },
      { year: 12, age: 73, accountValueEOY: 87765, rothBalance: 712749 },
      { year: 13, age: 74, accountValueEOY: 91276, rothBalance: 741259 },
    ],
    expectedSummary: {
      finalAccountValue: 91276,
      finalRothBalance: 741259,
      totalConverted: 500000,
      totalConversionTaxes: 120000,
      netLegacy: 800588,
    },
  },
  
  {
    id: 'test-6',
    name: 'Baseline Comparison (No Conversions)',
    description: 'Verify do-nothing scenario for comparison',
    inputs: {
      product: 'lincoln-optiblend-7',
      clientAge: 62,
      qualifiedAccountValue: 500000,
      rateOfReturn: 4,
      endAge: 74,
      conversionType: 'none',
      heirTaxRate: 35,
    },
    expectedSummary: {
      finalAccountValue: 832536.75,
      finalRothBalance: 0,
      totalConverted: 0,
      netLegacy: 541148.89,
    },
  },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function assertEqual(actual, expected, fieldName, tolerance = TOLERANCE) {
  if (actual === undefined || actual === null) {
    return {
      passed: false,
      message: `${fieldName}: Value is undefined/null (expected ${formatCurrency(expected)})`,
    };
  }
  
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    return {
      passed: false,
      message: `${fieldName}: Expected ${formatCurrency(expected)}, got ${formatCurrency(actual)} (diff: ${formatCurrency(diff)})`,
    };
  }
  return { passed: true, fieldName };
}

function runSingleTest(testCase) {
  console.log(`\n${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  console.log(`${COLORS.blue}TEST: ${testCase.name}${COLORS.reset}`);
  console.log(`${testCase.description}`);
  console.log(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  
  if (!calculateGrowthProjection) {
    console.log(`${COLORS.yellow}⚠ SKIPPED: No calculation function found. Update the import at the top of this file.${COLORS.reset}`);
    return { passed: false, skipped: true, testCase };
  }
  
  try {
    const productConfig = PRODUCTS[testCase.inputs.product];
    const result = calculateGrowthProjection(testCase.inputs, productConfig);
    
    const assertions = [];
    
    // Test yearly data
    if (testCase.expectedYearlyData && result.yearlyData) {
      testCase.expectedYearlyData.forEach((expected, index) => {
        const actual = result.yearlyData[index];
        if (!actual) {
          assertions.push({
            passed: false,
            message: `Year ${expected.year}: No data returned`,
          });
          return;
        }
        
        // Check each expected field
        Object.keys(expected).forEach(key => {
          if (key === 'year' || key === 'age') return; // Skip non-numeric fields
          
          // Try common field name variations
          const actualValue = actual[key] 
            || actual[key.replace('EOY', '')] 
            || actual[key.replace('accountValueEOY', 'accountValue')]
            || actual[key.replace('accountValueEOY', 'eoyAccountValue')];
          
          if (actualValue !== undefined) {
            assertions.push(assertEqual(actualValue, expected[key], `Year ${expected.year} ${key}`));
          }
        });
      });
    }
    
    // Test summary data
    if (testCase.expectedSummary && result.summary) {
      Object.keys(testCase.expectedSummary).forEach(key => {
        const actualValue = result.summary[key];
        assertions.push(assertEqual(actualValue, testCase.expectedSummary[key], `Summary.${key}`));
      });
    }
    
    // Report results
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
    return { passed: false, error: error.message, testCase };
  }
}

function runAllTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('  GROWTH PRODUCTS CALCULATION TEST SUITE');
  console.log('█'.repeat(70));
  
  if (!calculateGrowthProjection) {
    console.log(`
${COLORS.yellow}
╔══════════════════════════════════════════════════════════════════════╗
║  NO CALCULATION FUNCTION FOUND                                       ║
║                                                                      ║
║  To run these tests, you need to:                                    ║
║                                                                      ║
║  1. Find the Growth FIA calculation function in this codebase        ║
║  2. Update the import/require at the top of this file                ║
║  3. Re-run: node growth-calculation-tests.js                         ║
║                                                                      ║
║  Look for files like:                                                ║
║  - calculations.js, engine.js, formulas.js                           ║
║  - growthCalculations.js, projectionEngine.js                        ║
║                                                                      ║
║  The function should take inputs and return yearlyData + summary     ║
╚══════════════════════════════════════════════════════════════════════╝
${COLORS.reset}`);
  }
  
  const results = TEST_CASES.map(runSingleTest);
  
  // Summary
  console.log('\n' + '█'.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('█'.repeat(70));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  
  console.log(`
  Total:   ${results.length} tests
  Passed:  ${COLORS.green}${passed}${COLORS.reset}
  Failed:  ${COLORS.red}${failed}${COLORS.reset}
  Skipped: ${COLORS.yellow}${skipped}${COLORS.reset}
  `);
  
  if (failed > 0) {
    console.log(`${COLORS.red}FAILED TESTS:${COLORS.reset}`);
    results.filter(r => !r.passed && !r.skipped).forEach(r => {
      console.log(`  • ${r.testCase.name}`);
    });
    
    console.log(`
${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}
${COLORS.yellow}HOW TO FIX:${COLORS.reset}

1. Review each failing test above
2. Compare expected vs actual values
3. Fix the calculation logic (NOT the expected values)
4. Re-run this test file
5. Repeat until all tests pass

${COLORS.yellow}COMMON ISSUES:${COLORS.reset}

• Bonus timing: Upfront bonus applies BEFORE year 1, anniversary after interest
• Bonus base: Anniversary bonus = 4% of value AFTER interest, not BOY
• Surrender indexing: Year 1 = array index 0
• Roth timing: Existing Roth grows FIRST, then add new conversion
• Interest before conversion: IRA earns full year interest, then conversion
${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}
`);
  } else if (passed === results.length) {
    console.log(`${COLORS.green}🎉 ALL TESTS PASSED! Calculations are verified correct.${COLORS.reset}\n`);
  }
  
  return { passed, failed, skipped, total: results.length };
}

// Run tests
runAllTests();
