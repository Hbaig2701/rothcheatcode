import type { PrepFacts, PrepSheet } from './types';

const usd = (c: number) => '$' + Math.round(c / 100).toLocaleString('en-US');
const yrs = (n: number) => `${n} year${n === 1 ? '' : 's'}`;

/**
 * Plain-text rendering of the brief — used by the prototype and as the
 * reference for what the UI must show. Written for an advisor reading it in a
 * car park ninety seconds before a meeting: short sentences, no jargon, every
 * number followed by what it means.
 *
 * Copy addresses the client by first name and uses they/their — we never know
 * gender from a name, and getting it wrong in front of that client is worse
 * than being slightly less fluent.
 */
export function renderText(sheet: PrepSheet): string {
  const f: PrepFacts = sheet.facts;
  const N = f.firstName;
  const L: string[] = [];
  const rule = '─'.repeat(74);

  L.push(rule);
  L.push(`PRE-MEETING PREP — ${f.name}`);
  L.push(
    `${f.isMarried ? 'Married' : 'Single'}${f.state ? ', ' + f.state : ''} · Age ${f.age} · Retirement account ${usd(f.ira)}` +
      (f.roth > 0 ? ` · Roth already ${usd(f.roth)}` : ''),
  );
  L.push('ADVISOR USE ONLY — do not give this to the client');
  L.push(rule);

  L.push('');
  if (f.legacyGain > 0) {
    L.push('START HERE');
    L.push(`  Doing nothing leaves the family ${usd(f.baselineNetLegacy)}.`);
    L.push(`  This plan leaves them ${usd(f.strategyNetLegacy)}.`);
    L.push(`  That is ${usd(f.legacyGain)} more.`);
  } else {
    L.push('DO NOT START WITH THE LEGACY NUMBER');
    L.push(`  This plan leaves the family ${usd(Math.abs(f.legacyGain))} less than doing nothing.`);
    if (f.lifetimeTaxSaved > 0)
      L.push(`  Start with the tax instead: ${usd(f.lifetimeTaxSaved)} less tax over ${N}'s lifetime.`);
    L.push(`  See the warning below before you present this.`);
  }

  if (f.conversionYears > 0) {
    L.push('');
    L.push("THE PART THEY WON'T LIKE");
    L.push(
      `  ${N} pays ${usd(f.conversionTaxTotal)} in tax over ${yrs(f.conversionYears)}` +
        (f.conversionFirstAge != null ? ` (ages ${f.conversionFirstAge}-${f.conversionLastAge}).` : '.'),
    );
    if (f.worstYearAge != null)
      L.push(`  The worst single year is ${usd(f.worstYearTax)} at age ${f.worstYearAge}.`);
  }

  L.push('');
  L.push('IF THEY ASK "WHAT IF I DIE EARLY?"');
  if (!f.aheadAtEnd) {
    if (f.legacyFallsBehindAge != null && f.legacyFallsBehindAge > f.age) {
      L.push(`  The family is ahead until age ${f.legacyFallsBehindAge}, then falls behind and stays behind.`);
      L.push(`  If ${N} dies before ${f.legacyFallsBehindAge}, the family is better off. After that, worse off.`);
      L.push(`  Answer honestly if asked — do not claim a benefit that is not there at the end.`);
    } else {
      L.push(`  The family is behind throughout this projection — including at ${f.endAge}.`);
      L.push(`  This plan is not about leaving more behind. Do not claim that it is.`);
    }
  } else if (f.legacyCrossoverAge != null && f.legacyCrossoverAge <= f.age) {
    L.push(`  The family is ahead from day one. There is no break-even to explain.`);
    L.push(`  Good answer to give: "You are ahead immediately — there is no waiting period."`);
  } else {
    L.push(`  The family is ahead from age ${f.legacyCrossoverAge} onward. The plan runs to ${f.endAge}.`);
    L.push(`  If ${N} dies before ${f.legacyCrossoverAge}, the family is behind. Say that plainly if asked.`);
  }
  if (f.taxPaybackAge != null && f.taxPaybackAge !== f.legacyCrossoverAge) {
    L.push(
      `  (Separately, the cumulative tax bill turns in their favour at ${f.taxPaybackAge}. Use the`,
    );
    L.push(`  age above when talking about what the family receives — they are different measures.)`);
  }

  L.push('');
  L.push('WHAT HAPPENS IF THEY DO NOTHING');
  if (f.firstRmdAge != null) {
    if (f.alreadyPastRmdAge) {
      L.push(`  ${N} is already forced to take money out every year — ${usd(f.firstRmdAmount)} to start.`);
    } else {
      L.push(
        `  At ${f.firstRmdAge} the government makes them take ${usd(f.firstRmdAmount)} out, whether they need it or not.`,
      );
    }
    if (f.peakRmdAge != null && f.peakRmdAmount > f.firstRmdAmount)
      L.push(`  By age ${f.peakRmdAge} that forced withdrawal grows to ${usd(f.peakRmdAmount)} a year.`);
  }
  L.push(
    `  The heirs inherit ${usd(f.baselineFinalTraditional)} in a taxable account. ${usd(f.baselineHeirTax)} of it goes to the IRS.`,
  );
  if (f.lifetimeTaxSaved > 0)
    L.push(`  Total tax over their lifetime drops by ${usd(f.lifetimeTaxSaved)} with this plan.`);
  if (!f.alreadyPastRmdAge && f.yearsOfRunway > 0)
    L.push(`  ${yrs(f.yearsOfRunway)} before forced withdrawals start. After that this gets harder.`);

  const watch = sheet.warnings.filter((x) => x.tone === 'watch');
  const check = sheet.warnings.filter((x) => x.tone === 'check');

  if (watch.length) {
    L.push('');
    L.push('!! WATCH OUT FOR THIS');
    for (const x of watch) {
      L.push('');
      L.push(`  ${x.headline}`);
      L.push(`    ${wrap(x.detail, 68, '    ')}`);
      if (x.say) {
        L.push('');
        L.push(`    HOW TO SAY IT:`);
        L.push(`    "${wrap(x.say, 66, '     ')}"`);
      }
    }
  }

  if (check.length) {
    L.push('');
    L.push('BEFORE YOU PRESENT THIS');
    for (const x of check) {
      L.push('');
      L.push(`  ${x.headline}`);
      L.push(`    ${wrap(x.detail, 68, '    ')}`);
    }
  }

  L.push('');
  L.push(rule);
  L.push(`Every number comes from this client's saved projection. If one looks wrong, it`);
  L.push(`is wrong on the report too — tell us rather than repeating it to a client.`);
  L.push(rule);
  return L.join('\n');
}

function wrap(s: string, width: number, indent: string): string {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      out.push(line.trim());
      line = word;
    } else line += ' ' + word;
  }
  if (line.trim()) out.push(line.trim());
  return out.join('\n' + indent);
}
