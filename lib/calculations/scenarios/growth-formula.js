/**
 * Growth FIA Formula Scenario - JavaScript version for testing
 */

function getAgeAtYearOffset(clientAge, yearOffset) {
  return clientAge + yearOffset;
}

function runGrowthFormulaScenario(client, startYear, projectionYears) {
  const results = [];

  const clientAge = client.age ?? 62;
  const growthRate = (client.rate_of_return ?? 7) / 100;

  // Apply upfront bonus at issue
  const bonusPercent = client.bonus_percent ?? 0;
  const initialValue = client.qualified_account_value ?? 0;
  let iraBalance = Math.round(initialValue * (1 + bonusPercent / 100));
  let rothBalance = 0;

  // Tax rates
  const federalTaxRate = (client.tax_rate ?? client.max_tax_rate ?? 24) / 100;
  const stateTaxRate = (client.state_tax_rate ?? 0) / 100;

  // Conversion parameters
  const conversionType = client.conversion_type ?? 'optimized_amount';
  const yearsToDefer = client.years_to_defer_conversion ?? 0;
  const conversionStartAge = clientAge + yearsToDefer;
  const conversionEndAge = client.end_age ?? 100;

  for (let yearOffset = 0; yearOffset < projectionYears; yearOffset++) {
    const year = startYear + yearOffset;
    const age = getAgeAtYearOffset(clientAge, yearOffset);

    const boyIRA = iraBalance;
    const boyRoth = rothBalance;

    // Calculate interest on IRA
    const interest = Math.round(boyIRA * growthRate);
    let valueAfterInterest = boyIRA + interest;

    // Handle Roth conversions
    let conversionAmount = 0;
    let federalTax = 0;
    let stateTax = 0;

    const shouldConvert = conversionType !== 'no_conversion' &&
                          age >= conversionStartAge &&
                          age <= conversionEndAge &&
                          valueAfterInterest > 0;

    if (shouldConvert) {
      if (conversionType === 'full_conversion') {
        conversionAmount = valueAfterInterest;
      } else if (conversionType === 'optimized_amount' || conversionType === 'fixed_amount') {
        conversionAmount = valueAfterInterest;
      }

      if (conversionAmount > 0) {
        federalTax = Math.round(conversionAmount * federalTaxRate);
        stateTax = Math.round(conversionAmount * stateTaxRate);
      }

      valueAfterInterest -= conversionAmount;
    }

    // Grow existing Roth balance, then add new conversion
    const rothGrowth = Math.round(boyRoth * growthRate);
    rothBalance = boyRoth + rothGrowth + conversionAmount;

    iraBalance = valueAfterInterest;

    const totalTax = federalTax + stateTax;

    results.push({
      year,
      age,
      spouseAge: null,
      traditionalBalance: iraBalance,
      rothBalance,
      taxableBalance: 0,
      rmdAmount: 0,
      conversionAmount,
      ssIncome: 0,
      pensionIncome: 0,
      otherIncome: 0,
      totalIncome: conversionAmount,
      federalTax,
      stateTax,
      niitTax: 0,
      irmaaSurcharge: 0,
      totalTax,
      taxableSS: 0,
      netWorth: iraBalance + rothBalance
    });
  }

  return results;
}

module.exports = { runGrowthFormulaScenario };
