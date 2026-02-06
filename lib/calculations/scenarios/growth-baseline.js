/**
 * Growth FIA Baseline Scenario - JavaScript version for testing
 *
 * Simple compound growth, no conversions, no RMDs
 */

function getAgeAtYearOffset(clientAge, yearOffset) {
  return clientAge + yearOffset;
}

function runGrowthBaselineScenario(client, startYear, projectionYears) {
  const results = [];

  const clientAge = client.age ?? 62;
  const growthRate = (client.baseline_comparison_rate ?? client.rate_of_return ?? 7) / 100;

  // Initial balance - NO bonus in baseline
  let iraBalance = client.qualified_account_value ?? 0;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);

    const boyIRA = iraBalance;

    // Simple compound growth
    const interest = Math.round(boyIRA * growthRate);
    iraBalance = boyIRA + interest;

    results.push({
      year,
      age,
      spouseAge: null,
      traditionalBalance: iraBalance,
      rothBalance: 0,
      taxableBalance: 0,
      rmdAmount: 0,
      conversionAmount: 0,
      ssIncome: 0,
      pensionIncome: 0,
      otherIncome: 0,
      totalIncome: 0,
      federalTax: 0,
      stateTax: 0,
      niitTax: 0,
      irmaaSurcharge: 0,
      totalTax: 0,
      taxableSS: 0,
      netWorth: iraBalance
    });
  }

  return results;
}

module.exports = { runGrowthBaselineScenario };
