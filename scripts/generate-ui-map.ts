/**
 * Generate the chat KB's "Form sections" block from the actual source code.
 *
 * Why this exists:
 *   The hand-written KB drifts from the form. We've shipped bugs where the
 *   bot tells advisors to click fields that don't exist (Roth balance in
 *   Section 2), or invents validation limits ("SSI max is 70 / max is 83").
 *   The form components and Zod schemas are the source of truth, so we
 *   read them directly and emit a markdown block the KB imports verbatim.
 *
 * Re-run after any form/schema change:  npm run generate-ui-map
 *
 * Output:  lib/chat/generated/ui-map.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");

// The 9 sections rendered in components/clients/client-form.tsx, in order.
// Mirrors lines 18-26 + 346-354 of that file. If the form ever renders new
// sections, add the (component, file) pair here.
const RENDERED_SECTIONS: Array<{ component: string; file: string; fallbackTitle?: string }> = [
  { component: "ClientDataSection",        file: "components/clients/sections/client-data.tsx" },
  { component: "CurrentAccountSection",    file: "components/clients/sections/current-account.tsx" },
  { component: "NewAccountSection",        file: "components/clients/sections/new-account.tsx" },
  { component: "TaxDataSection",           file: "components/clients/sections/tax-data.tsx" },
  { component: "TaxableIncomeSection",     file: "components/clients/sections/taxable-income.tsx" },
  { component: "ConversionSection",        file: "components/clients/sections/conversion.tsx" },
  { component: "AumAllocationSection",     file: "components/clients/sections/aum-allocation.tsx" },
  { component: "RothWithdrawalsSection",   file: "components/clients/sections/roth-withdrawals.tsx" },
  // advanced-data.tsx uses a custom header (<span>9. Advanced Data</span>)
  // instead of <FormSection title="...">, so we hardcode the title.
  { component: "AdvancedDataSection",      file: "components/clients/sections/advanced-data.tsx", fallbackTitle: "9. Advanced Data" },
];

// Orphans we explicitly callout in the KB so the bot never invents a path
// to them. Each entry: filename → reason it's NOT in the form.
const ORPHAN_FILES = [
  "components/clients/sections/account-balances.tsx",
  "components/clients/sections/advanced.tsx",
  "components/clients/sections/income-sources.tsx",
  "components/clients/sections/personal-info.tsx",
  "components/clients/sections/tax-config.tsx",
];

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

function extractTitle(src: string, fallback?: string): string {
  const m = src.match(/<FormSection[\s\S]{0,200}?title=\{?"([^"]+)"/);
  if (m) return m[1];
  if (fallback) return fallback;
  return "(no title found)";
}

// Extract every field NAME mentioned in a Controller name="..." or
// register("...") call. These are the only ways react-hook-form fields are
// wired in this codebase. We also catch the <Input id="..."/> pattern as a
// fallback for simple inputs that don't use Controller.
function extractFieldNames(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/name=["']([a-z_][a-z0-9_]*)["']/gi)) names.add(m[1]);
  for (const m of src.matchAll(/register\(\s*["']([a-z_][a-z0-9_]*)["']/gi)) names.add(m[1]);
  return Array.from(names).sort();
}

// Parse the Zod schema for numeric ranges. Catches two shapes seen in
// lib/validations/client.ts:
//   1. `field: z.number().min(X, "...").max(Y, "...")...`
//   2. `field: z.preprocess(..., z.number().min(X).max(Y).optional()),`
// We walk the file character-by-character with a brace-balancing scan so the
// "value" of each top-level field assignment is captured correctly even when
// it spans multiple lines or contains nested parens/braces. Then we pull
// .min/.max from the captured value. Misses fields without numeric ranges,
// which is fine — we only care about ranges advisors can trip over.
function extractZodRanges(schemaSrc: string): Map<string, { min?: number; max?: number }> {
  const out = new Map<string, { min?: number; max?: number }>();
  // Match the start of a field assignment at indent ≥ 2 spaces. Captures
  // the field name; we then read until the matching balance closes.
  const startRegex = /(?:^|\n)\s{2,}([a-z_][a-z0-9_]*)\s*:\s*z\./g;
  for (const m of schemaSrc.matchAll(startRegex)) {
    const name = m[1];
    const startIdx = (m.index ?? 0) + m[0].length;
    // Read until the comma that closes this field at the field's own depth.
    let depth = 0;
    let i = startIdx;
    while (i < schemaSrc.length) {
      const c = schemaSrc[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      else if (c === "," && depth === 0) break;
      else if (c === "\n" && depth === 0) break; // bare-line field end
      i++;
    }
    const value = schemaSrc.slice(startIdx, i);
    const minMatch = value.match(/\.min\(\s*(-?\d+)/);
    const maxMatch = value.match(/\.max\(\s*(-?\d+)/);
    if (minMatch || maxMatch) {
      out.set(name, {
        min: minMatch ? Number(minMatch[1]) : undefined,
        max: maxMatch ? Number(maxMatch[1]) : undefined,
      });
    }
  }
  return out;
}

// Read the product registry. ALL_PRODUCTS is a spread of two const records,
// GROWTH_PRODUCTS and GUARANTEED_INCOME_PRODUCTS — so we parse each of those
// separately and tag the kind.
function extractProducts(): Array<{ id: string; label: string; kind: "Growth FIA" | "Guaranteed Income" }> {
  const src = readSrc("lib/config/products.ts");
  const out: Array<{ id: string; label: string; kind: "Growth FIA" | "Guaranteed Income" }> = [];
  // Each entry: <key>: { ... defaults: { ... productName: "X" ... } ... },
  // The top-level key can be a bare identifier ('fia') or a quoted string.
  const entryRegex = /^\s{2}(['"]?)([a-z][a-z0-9-]*)\1\s*:\s*\{[\s\S]*?productName:\s*['"]([^'"]+)['"][\s\S]*?\n\s{2}\},?/gm;
  const parseBlock = (blockLabel: "Growth FIA" | "Guaranteed Income", constName: string) => {
    const blockMatch = src.match(new RegExp(`export const ${constName}[^=]*=\\s*\\{([\\s\\S]+?)\\n\\}\\s*;`));
    if (!blockMatch) return;
    const body = blockMatch[1];
    for (const m of body.matchAll(entryRegex)) {
      out.push({ id: m[2], label: m[3], kind: blockLabel });
    }
  };
  parseBlock("Growth FIA", "GROWTH_PRODUCTS");
  parseBlock("Guaranteed Income", "GUARANTEED_INCOME_PRODUCTS");
  return out;
}

function generate(): string {
  const schemaSrc = readSrc("lib/validations/client.ts");
  const ranges = extractZodRanges(schemaSrc);

  const lines: string[] = [];
  lines.push("# Form sections (GENERATED FROM SOURCE — do not hand-edit, run `npm run generate-ui-map`)");
  lines.push("");
  lines.push("These are the exact sections rendered in the main client form (`/clients/new`), in the exact order they appear, with the exact field names each section actually contains. Sourced from the React components and the Zod validators in this repo. If a field/section is NOT listed here, it is NOT in the form — do not tell an advisor to look for it.");
  lines.push("");

  for (const s of RENDERED_SECTIONS) {
    const src = readSrc(s.file);
    // Titles already start with their own number prefix ("1. Client Data"),
    // so we use them as-is rather than double-numbering.
    const title = extractTitle(src, s.fallbackTitle);
    const fields = extractFieldNames(src);
    lines.push(`## ${title}`);
    lines.push(`Source: \`${s.file}\``);
    if (fields.length === 0) {
      lines.push("- (no individual field inputs detected — likely a table or composite control)");
    } else {
      for (const f of fields) {
        const r = ranges.get(f);
        if (r) {
          const minStr = r.min !== undefined ? r.min : "−∞";
          const maxStr = r.max !== undefined ? r.max : "+∞";
          lines.push(`- \`${f}\` (number, range: ${minStr} to ${maxStr})`);
        } else {
          lines.push(`- \`${f}\``);
        }
      }
    }
    lines.push("");
  }

  lines.push("## Orphan components — NOT rendered in the form");
  lines.push("");
  lines.push("These files exist in the codebase but are not imported by `components/clients/client-form.tsx`. The fields they define are NOT visible to advisors in the form. If an advisor asks where to enter one of these fields, do NOT tell them to look in the form — the answer is that the input is not surfaced today.");
  lines.push("");
  for (const f of ORPHAN_FILES) {
    let title = "?";
    try {
      title = extractTitle(readSrc(f));
    } catch { /* file may be missing — ignore */ }
    lines.push(`- \`${f}\` (orphan title: "${title}")`);
  }
  lines.push("");

  const products = extractProducts();
  if (products.length > 0) {
    lines.push("## Product presets shipped with the platform");
    lines.push("");
    lines.push("These are the system presets shown in the Product Preset dropdown on Section 3. Custom products built under Settings → My Products appear below these. If an advisor mentions a product not in this list, it must be a custom product or an external one they want to model.");
    lines.push("");
    for (const p of products) {
      lines.push(`- ${p.label} (\`${p.id}\`, kind: ${p.kind})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const generated = generate();

const outDir = resolve(ROOT, "lib/chat/generated");
mkdirSync(outDir, { recursive: true });

const outFile = resolve(outDir, "ui-map.ts");
const escapedForBacktickTemplate = generated.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const fileContents = `// AUTO-GENERATED by scripts/generate-ui-map.ts — DO NOT EDIT BY HAND.
// Re-run \`npm run generate-ui-map\` after any form/schema/products change.
// This file is the chat assistant's source of truth for what UI exists.

export const GENERATED_UI_MAP = \`${escapedForBacktickTemplate}\`;
`;
writeFileSync(outFile, fileContents, "utf-8");

// Also print to stdout so the developer can eyeball the output.
console.log("Wrote:", outFile);
console.log("--- BEGIN GENERATED ---");
console.log(generated);
console.log("--- END GENERATED ---");
