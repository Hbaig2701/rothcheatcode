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

// Many sections have a `description="..."` on <FormSection> that explains
// what the section does. When the section is a composite control (no
// individual <Controller> fields, like the withdrawals table), the
// description is the only thing the bot has to go on — without it the
// generated map just says "(no individual fields detected)" which is
// useless for advisors asking how to use that section.
function extractDescription(src: string): string | null {
  const m = src.match(/<FormSection[\s\S]{0,400}?description=\{?"([^"]+)"/);
  return m ? m[1].trim() : null;
}

// Extract every field NAME mentioned in a Controller name="..." or
// register("...") call. These are the only ways react-hook-form fields are
// wired in this codebase.
function extractFieldNames(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/name=["']([a-z_][a-z0-9_]*)["']/gi)) names.add(m[1]);
  for (const m of src.matchAll(/register\(\s*["']([a-z_][a-z0-9_]*)["']/gi)) names.add(m[1]);
  return Array.from(names).sort();
}

// Pair field names with the EXACT user-facing label rendered next to them.
// We match <FieldLabel htmlFor="X">Label text</FieldLabel> patterns, since
// the htmlFor attribute is keyed to the form field's `id`/`name`. Without
// this, the generated map only knew `max_tax_rate` (the schema name), so
// the bot would echo snake_case to advisors instead of "Max Tax Rate".
// That violates the existing "plain language, no tech jargon" tone rule
// and was the regression v1 of this generator shipped with.
function extractFieldLabels(src: string): Map<string, string> {
  const out = new Map<string, string>();
  // Pass 1: explicit pairing via <FieldLabel htmlFor="foo">Label</FieldLabel>.
  for (const m of src.matchAll(/<FieldLabel[^>]*\bhtmlFor=["']([^"']+)["'][^>]*>([\s\S]*?)<\/FieldLabel>/g)) {
    const name = m[1];
    const label = cleanLabelText(m[2]);
    if (label) out.set(name, label);
  }
  // Pass 2: <Controller name="X"> followed (a few lines later, inside the
  // render prop) by a bare <FieldLabel>Label</FieldLabel> with NO htmlFor —
  // typical for radio groups (`tax_payment_source`, `conversion_type`) and
  // checkbox clusters (`protect_initial_premium`). We walk FORWARD from each
  // unlabelled `name=` to the next `name=` declaration (the boundary into a
  // sibling field) and look for the first FieldLabel in that window. This
  // prevents false pairing with a previous field's label.
  const nameMatches = [...src.matchAll(/name=["']([a-z_][a-z0-9_]*)["']/g)];
  for (let i = 0; i < nameMatches.length; i++) {
    const m = nameMatches[i];
    const name = m[1];
    if (out.has(name)) continue;
    const startIdx = (m.index ?? 0) + m[0].length;
    // Window = from end of this name= to the start of the next name=
    // (or end of file). Inner radio <input name="X">s have the same
    // name as the outer Controller, so they'd be skipped by out.has(name).
    // Bound the forward search at min(400 chars, next name= boundary). The
    // 400-char cap keeps us inside the Controller's own render prop — going
    // further drifts into the NEXT sibling field's UI and we mislabel.
    // `surrender_schedule` is a custom composite with no FieldLabel of its
    // own; without the cap, the forward search would borrow "Annual Rider
    // Fee" from the next Controller and report it under surrender_schedule.
    const nextNameIdx = i + 1 < nameMatches.length ? nameMatches[i + 1].index ?? src.length : src.length;
    const endIdx = Math.min(nextNameIdx, startIdx + 400);
    const window = src.slice(startIdx, endIdx);
    const labelMatch = window.match(/<FieldLabel(?![^>]*htmlFor)[^>]*>([\s\S]*?)<\/FieldLabel>/);
    if (!labelMatch) continue;
    const label = cleanLabelText(labelMatch[1]);
    if (label) out.set(name, label);
  }
  return out;
}

// Strip nested JSX expressions ({...}) and tags from a FieldLabel's children.
// Source labels often look like:
//   "Bonus % {isBonusLocked && (<Lock className=... />)}"
// We want just "Bonus %". JSX expressions can nest, so we walk the string
// with a brace counter rather than a naive regex.
function cleanLabelText(raw: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "{") { depth++; continue; }
    if (c === "}") { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out += c;
  }
  return out
    .replace(/<[^>]+>/g, "")          // strip nested HTML/React tags
    // Decode the small set of HTML entities JSX commonly emits in labels.
    // Without this we'd render "Show Widow&apos;s Penalty" verbatim to the
    // bot, which would then parrot the entity to advisors.
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")             // collapse whitespace
    .replace(/[ \t]+([.,!?:])/g, "$1") // trim space before sentence punctuation
    .trim();
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
  // the field name; we then read until the matching balance closes. The
  // captured `value` is everything after `z.` up to the field's terminating
  // comma at depth 0.
  const startRegex = /(?:^|\n)\s{2,}([a-z_][a-z0-9_]*)\s*:\s*z\./g;
  for (const m of schemaSrc.matchAll(startRegex)) {
    const name = m[1];
    const startIdx = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let i = startIdx;
    while (i < schemaSrc.length) {
      const c = schemaSrc[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      else if (c === "," && depth === 0) break;
      else if (c === "\n" && depth === 0) break;
      i++;
    }
    const value = schemaSrc.slice(startIdx, i);
    // CRITICAL: only emit numeric ranges for fields actually typed as
    // a *single* number. v1 shipped with two bugs:
    //   1. `z.string().min(1).max(100)` → reported as "number, range 1-100"
    //   2. `z.array(z.number().min(0).max(100))` → reported as a scalar with
    //      that range, when it's actually an array of percents
    // We accept only:
    //   - "number(" at the very start (primary case: z.number()...)
    //   - "preprocess(" at the start AND z.number() somewhere inside its
    //     args (the NaN-safe SS payout age pattern)
    // Anything starting with "string", "array", "enum", "boolean", "object",
    // "tuple", "record", "union", "literal", etc. is rejected.
    const startsWithNumber = value.startsWith("number(");
    const isPreprocessedNumber = value.startsWith("preprocess(") && /\bz\.number\(/.test(value);
    if (!startsWithNumber && !isPreprocessedNumber) continue;
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
    const description = extractDescription(src);
    const fields = extractFieldNames(src);
    const labels = extractFieldLabels(src);
    lines.push(`## ${title}`);
    lines.push(`Source: \`${s.file}\``);
    if (description) lines.push(`_${description}_`);
    if (fields.length === 0) {
      lines.push("- (no individual field inputs detected — this section is rendered as a table or composite control; see the description above for what it does)");
    } else {
      for (const f of fields) {
        const label = labels.get(f);
        const r = ranges.get(f);
        // Format: **Label** (schema_name, optional range). Bot is expected to
        // say "Max Tax Rate" to the advisor, not "max_tax_rate" — the schema
        // name is parenthetical so the bot can still match advisor questions
        // that mention the underlying key.
        const head = label ? `**${label}** (\`${f}\`)` : `\`${f}\``;
        if (r) {
          const minStr = r.min !== undefined ? r.min : "−∞";
          const maxStr = r.max !== undefined ? r.max : "+∞";
          lines.push(`- ${head} — number, range: ${minStr} to ${maxStr}`);
        } else {
          lines.push(`- ${head}`);
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
