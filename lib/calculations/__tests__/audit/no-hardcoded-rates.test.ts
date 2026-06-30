/**
 * Source guard — no hardcoded heir tax rate in LIVE display/chat code.
 *
 * Run: npx tsx lib/calculations/__tests__/audit/no-hardcoded-rates.test.ts
 *
 * F1/F9 recurred because surface after surface hardcoded a 40% heir rate instead
 * of reading client.heir_tax_rate. This scans the source and fails if a NEW
 * hardcoded heir/legacy rate appears in live code. Known dead components (never
 * mounted — see AUDIT.md F9) are allow-listed; revive one and you must fix it.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(process.cwd());
const SCAN_DIRS = ['components', 'lib/chat'];
// Dead/unmounted components that still hardcode 40% (documented F9 — latent).
// Allow-listed so the guard tracks NEW regressions, not the known landmines.
const ALLOW = new Set([
  'components/report/gi-summary-breakdown-table.tsx',
  'components/report/summary-comparison-table.tsx',
  'components/results/results-summary.tsx',
  'components/results/multi-strategy-results.tsx',
]);
// Pattern: a heir/legacy rate assigned a 0.4x literal (not reading a client field).
const BAD = /(heir\w*|legacy\w*)\s*(tax)?\s*rate[A-Za-z]*\s*=\s*0\.4\d*/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const e of entries) {
    const rel = `${dir}/${e}`;
    const full = join(ROOT, rel);
    let s; try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(e)) out.push(rel);
  }
  return out;
}

let scanned = 0;
const violations: string[] = [];
for (const d of SCAN_DIRS) {
  for (const file of walk(d)) {
    if (ALLOW.has(file)) continue;
    scanned++;
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      // Skip the safe pattern `(client.heir_tax_rate ?? 40) / 100` and comments.
      if (/client\.heir_tax_rate/.test(ln) || /^\s*(\/\/|\*)/.test(ln)) return;
      if (BAD.test(ln)) violations.push(`${file}:${i + 1}  ${ln.trim()}`);
    });
  }
}

console.log(`scanned ${scanned} live files in ${SCAN_DIRS.join(', ')}`);
if (violations.length > 0) {
  console.error(`\n❌ ${violations.length} hardcoded heir/legacy rate(s) in LIVE code — read client.heir_tax_rate instead:`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log('✓ no hardcoded heir rate in live display/chat code');
process.exit(0);
