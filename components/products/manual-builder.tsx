"use client";

import { useState } from "react";
import {
  ARCHETYPE_LABELS,
  type ProductArchetype,
  type ProductConfigPayload,
  type ModifierFlag,
  type CustomProductRow,
} from "@/lib/products/types";
import { defaultGrowthConfig, defaultIncomeConfig, inferModifierFlags } from "./archetype-helpers";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProduct, useUpdateProduct } from "@/lib/queries/products";
import { Loader2, Lock } from "lucide-react";

const GROWTH_ARCHETYPES: ProductArchetype[] = [
  "growth-vesting",
  "growth-phased",
  "growth-immediate",
  "growth-no-bonus",
];
const INCOME_ARCHETYPES: ProductArchetype[] = [
  "income-simple-both",
  "income-simple-base",
  "income-compound-flat",
  "income-compound-split",
];

// Plain-English explanations shown beneath each option in the structure
// dropdown so advisors don't have to reverse-engineer our taxonomy.
const ARCHETYPE_DESCRIPTIONS: Record<ProductArchetype, string> = {
  "growth-vesting":
    "Premium bonus is credited day 1 but partially forfeited if the client surrenders early (recapture schedule).",
  "growth-phased":
    "Bonus is paid out in pieces, usually as anniversary credits over the first few years.",
  "growth-immediate":
    "Premium bonus is credited in full on day 1 with no vesting (e.g., Athene Ascent Pro, Allianz, EquiTrust).",
  "growth-no-bonus":
    "No premium bonus. Just an FIA with index crediting and a surrender schedule.",
  "income-simple-both":
    "Income base grows linearly each year (simple roll-up). Bonus boosts both the account value and the income base.",
  "income-simple-base":
    "Same simple roll-up, but the bonus boosts only the income base — the account value gets no bonus.",
  "income-compound-flat":
    "Income base compounds year-over-year at a single flat rate (e.g., 7% every year).",
  "income-compound-split":
    "Income base compounds at one rate early, then a different rate later (e.g., 7% years 1-5, 4% years 6-10).",
};

// Display labels (shown inside SelectValue triggers — Base UI doesn't auto-render SelectItem labels)
const CATEGORY_LABELS: Record<"growth" | "income", string> = {
  growth: "Growth",
  income: "Guaranteed Income",
};
const BONUS_TYPE_LABELS: Record<"vesting" | "immediate" | "phased" | "none", string> = {
  vesting: "Vesting",
  immediate: "Immediate",
  phased: "Phased",
  none: "None",
};
const YEAR_1_RULE_LABELS: Record<"same" | "interest_only" | "custom", string> = {
  same: "Same as other years",
  interest_only: "Interest only",
  custom: "Custom %",
};
const BONUS_APPLIES_LABELS: Record<"both" | "income_base" | "account_value", string> = {
  both: "Both AV + Income Base",
  income_base: "Income Base only",
  account_value: "Account Value only",
};
const ROLL_UP_TYPE_LABELS: Record<"simple" | "compound", string> = {
  simple: "Simple",
  compound: "Compound",
};

interface ManualBuilderProps {
  initialCategory?: "growth" | "income";
  initialName?: string;
  initialArchetype?: ProductArchetype;
  initialConfig?: ProductConfigPayload;
  initialCarrier?: string | null;
  initialCarrierProduct?: string | null;
  initialFlags?: ModifierFlag[];
  initialSource?: CustomProductRow["source"];
  initialAISources?: CustomProductRow["ai_research_sources"];
  initialAIWarnings?: CustomProductRow["ai_warnings"];
  initialUnsupported?: CustomProductRow["ai_unsupported_features"];
  productId?: string; // when editing
  onSaved: (product: CustomProductRow) => void;
  onCancel: () => void;
}

export function ManualBuilder({
  initialCategory = "growth",
  initialName = "",
  initialArchetype,
  initialConfig,
  initialCarrier = null,
  initialCarrierProduct = null,
  initialFlags,
  initialSource = "manual",
  initialAISources = null,
  initialAIWarnings = null,
  initialUnsupported = null,
  productId,
  onSaved,
  onCancel,
}: ManualBuilderProps) {
  const [category, setCategory] = useState<"growth" | "income">(initialCategory);
  const [archetype, setArchetype] = useState<ProductArchetype>(
    initialArchetype ?? (initialCategory === "growth" ? "growth-vesting" : "income-simple-both")
  );
  const [name, setName] = useState(initialName);
  const [carrierName, setCarrierName] = useState(initialCarrier ?? "");
  const [carrierProductName, setCarrierProductName] = useState(initialCarrierProduct ?? "");
  const [config, setConfig] = useState<ProductConfigPayload>(
    initialConfig ?? defaultGrowthConfig("growth-vesting")
  );
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct(productId ?? "");
  const isPending = createMut.isPending || updateMut.isPending;

  // When the user actively changes the category, reset archetype + config to
  // sane defaults for that side of the engine. Implemented as an event handler
  // instead of an effect on [category] — the effect form ran on initial mount
  // and silently blew away initialConfig/initialArchetype passed in from the
  // AI research handoff, so the manual builder showed default preset numbers
  // instead of the values the user just verified on the "Product Found" screen.
  const handleCategoryChange = (newCategory: "growth" | "income") => {
    setCategory(newCategory);
    if (productId) return; // editing — don't reset
    if (newCategory === "growth") {
      setArchetype("growth-vesting");
      setConfig(defaultGrowthConfig("growth-vesting"));
    } else {
      setArchetype("income-simple-both");
      setConfig(defaultIncomeConfig("income-simple-both"));
    }
  };

  // When archetype changes, reseed only the archetype-specific parts of the
  // config (bonus shape + income roll-up shape). Preserve surrender schedule,
  // fees, withdrawals, state availability, and other — those are independent
  // of archetype and an advisor correcting an AI mismatch shouldn't lose
  // values they just verified on the Product Found screen.
  const handleArchetypeChange = (a: ProductArchetype) => {
    setArchetype(a);
    if (productId) return; // don't reset when editing
    const fresh = a.startsWith("growth-")
      ? defaultGrowthConfig(a)
      : defaultIncomeConfig(a);
    setConfig((prev) => ({
      ...prev,
      bonus: fresh.bonus,
      income: fresh.income ?? null,
    }));
  };

  const updateConfig = <K extends keyof ProductConfigPayload>(
    key: K,
    value: ProductConfigPayload[K]
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSurrenderYearsChange = (years: number) => {
    const cur = config.surrender.schedule;
    let schedule: number[];
    if (years > cur.length) {
      schedule = [...cur, ...Array(years - cur.length).fill(0)];
    } else {
      schedule = cur.slice(0, years);
    }
    updateConfig("surrender", { ...config.surrender, years, schedule });
  };

  const handleScheduleEdit = (idx: number, val: number) => {
    const newSchedule = [...config.surrender.schedule];
    newSchedule[idx] = val;
    updateConfig("surrender", { ...config.surrender, schedule: newSchedule });
  };

  // Resolve the vesting schedule as an explicit array (year-by-year vested %)
  const getVestingArray = (): number[] => {
    const v = config.bonus.vesting_schedule;
    const years = config.bonus.vesting_years ?? config.surrender.years ?? 10;
    if (Array.isArray(v) && v.length === years) return v;
    // Default to linear: each year vests an equal fraction (e.g., 10 yr = 10%, 20%, ..., 100%)
    return Array.from({ length: years }, (_, i) =>
      parseFloat((((i + 1) / years) * 100).toFixed(1))
    );
  };

  const setVestingArray = (arr: number[]) => {
    updateConfig("bonus", {
      ...config.bonus,
      vesting_schedule: arr,
      vesting_years: arr.length,
    });
  };

  const handleVestingEdit = (idx: number, val: number) => {
    const cur = getVestingArray();
    const next = [...cur];
    next[idx] = val;
    setVestingArray(next);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Display name is required");
      return;
    }
    if (config.surrender.schedule.length !== config.surrender.years) {
      setError(`Surrender schedule has ${config.surrender.schedule.length} entries but should have ${config.surrender.years}`);
      return;
    }

    const flags = inferModifierFlags(config);

    // Merge any flags the AI extracted (passed in via initialFlags) with the
    // ones we can infer from visible config. inferModifierFlags only sees the
    // fields exposed in the form; AI may have surfaced flags like
    // has_enhanced_income from a brochure mention that doesn't have a
    // dedicated form control. Without the merge, editing wipes those flags.
    const mergedFlags = initialFlags && initialFlags.length > 0
      ? Array.from(new Set([...initialFlags, ...flags]))
      : flags;

    try {
      let result: CustomProductRow;
      if (productId) {
        result = await updateMut.mutateAsync({
          name: name.trim(),
          carrier_name: carrierName.trim() || null,
          carrier_product_name: carrierProductName.trim() || null,
          archetype,
          modifier_flags: mergedFlags,
          config,
        });
      } else {
        result = await createMut.mutateAsync({
          name: name.trim(),
          carrier_name: carrierName.trim() || null,
          carrier_product_name: carrierProductName.trim() || null,
          category,
          archetype,
          modifier_flags: mergedFlags,
          config,
          source: initialSource,
          ai_research_sources: initialAISources,
          ai_warnings: initialAIWarnings,
          ai_unsupported_features: initialUnsupported,
        });
      }
      onSaved(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const isAIExtracted = initialSource === "ai_document" || initialSource === "ai_research";

  return (
    <div className="space-y-5">
      {/* AI extraction banner */}
      {isAIExtracted && !productId && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <svg className="size-5 shrink-0 mt-0.5 text-primary" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div className="flex-1">
            <div className="font-medium text-foreground">
              {initialSource === "ai_document"
                ? "Values pre-filled from your uploaded PDF"
                : "Values pre-filled from web research"}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review every field below and edit anything that needs correcting before saving. The AI&apos;s best guesses aren&apos;t always perfect.
            </p>
          </div>
        </div>
      )}

      {/* Display name */}
      <Field>
        <FieldLabel>Display Name</FieldLabel>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., High-Bonus Vesting Growth"
          maxLength={100}
        />
        <FieldDescription>This is how the product appears in your library and on reports.</FieldDescription>
      </Field>

      {/* Category + archetype */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field>
          <FieldLabel>Category</FieldLabel>
          <Select value={category} onValueChange={(v) => handleCategoryChange(v as "growth" | "income")} disabled={!!productId}>
            <SelectTrigger>
              <SelectValue>{CATEGORY_LABELS[category]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="income">Guaranteed Income</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Product structure</FieldLabel>
          <Select value={archetype} onValueChange={(v) => handleArchetypeChange(v as ProductArchetype)}>
            <SelectTrigger>
              <SelectValue>{ARCHETYPE_LABELS[archetype]}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-w-[480px]">
              <SelectGroup>
                <SelectLabel>{category === "growth" ? "Growth" : "Income"}</SelectLabel>
                {(category === "growth" ? GROWTH_ARCHETYPES : INCOME_ARCHETYPES).map((a) => (
                  <SelectItem key={a} value={a}>
                    <div className="flex flex-col gap-0.5 whitespace-normal py-0.5">
                      <span className="font-medium text-foreground">{ARCHETYPE_LABELS[a]}</span>
                      <span className="text-xs text-muted-foreground leading-snug">
                        {ARCHETYPE_DESCRIPTIONS[a]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Tells the engine how to model bonuses and roll-ups for this product.{" "}
            <span className="text-foreground/80">{ARCHETYPE_DESCRIPTIONS[archetype]}</span>
          </FieldDescription>
        </Field>
      </div>

      {/* Carrier (private) */}
      <details className="group rounded-lg border border-border bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium select-none">
          Private notes (carrier name, original product name)
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
          <Field>
            <FieldLabel>Carrier</FieldLabel>
            <Input value={carrierName} onChange={(e) => setCarrierName(e.target.value)} placeholder="e.g., Athene" />
          </Field>
          <Field>
            <FieldLabel>Carrier Product Name</FieldLabel>
            <Input value={carrierProductName} onChange={(e) => setCarrierProductName(e.target.value)} placeholder="e.g., Performance Elite Plus 15" />
          </Field>
          <FieldDescription className="sm:col-span-2 text-xs">
            Stored privately in your account. Never displayed on reports.
          </FieldDescription>
        </div>
      </details>

      <hr className="border-border" />

      {/* Bonus */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bonus</h3>
          <p className="text-xs text-muted-foreground/70 mt-1">
            The premium bonus is extra money the carrier credits to the account at issue. E.g., a 10% bonus on $500K = $50K added immediately.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel>Premium Bonus %</FieldLabel>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={config.bonus.percentage}
              onChange={(e) => updateConfig("bonus", { ...config.bonus, percentage: parseFloat(e.target.value) || 0 })}
            />
            <FieldDescription>Set to 0 if the product has no upfront bonus.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Bonus Type</FieldLabel>
            <Select
              value={config.bonus.type}
              onValueChange={(v) => updateConfig("bonus", { ...config.bonus, type: v as "vesting" | "immediate" | "phased" | "none" })}
            >
              <SelectTrigger>
                <SelectValue>{BONUS_TYPE_LABELS[config.bonus.type]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vesting">Vesting — bonus is recaptured on early surrender</SelectItem>
                <SelectItem value="immediate">Immediate — bonus is fully owned at issue</SelectItem>
                <SelectItem value="phased">Phased — premium bonus + anniversary credits</SelectItem>
                <SelectItem value="none">None — no bonus</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>How the bonus is treated if the client surrenders early.</FieldDescription>
          </Field>
          {config.bonus.type === "vesting" && (
            <Field>
              <FieldLabel>Vesting Years</FieldLabel>
              <Input
                type="number"
                min="1" max="30"
                value={config.bonus.vesting_years ?? ""}
                onChange={(e) => {
                  const yrs = parseInt(e.target.value) || null;
                  updateConfig("bonus", {
                    ...config.bonus,
                    vesting_years: yrs,
                    // Reset to linear when vesting period changes
                    vesting_schedule: yrs ? "linear" : null,
                  });
                }}
              />
              <FieldDescription>Years for the bonus to fully vest. Usually = surrender period.</FieldDescription>
            </Field>
          )}
        </div>

        {/* Vesting schedule editor — only when bonus type is vesting */}
        {config.bonus.type === "vesting" && (config.bonus.vesting_years ?? 0) > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-medium">Vesting Schedule (% vested by policy year)</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How much of the bonus the client owns each year. E.g., 0% in Year 1 means the entire bonus is recaptured if surrendering in year 1; 100% means fully owned.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => {
                    const y = config.bonus.vesting_years ?? config.surrender.years ?? 10;
                    const linear = Array.from({ length: y }, (_, i) =>
                      parseFloat((((i + 1) / y) * 100).toFixed(1))
                    );
                    setVestingArray(linear);
                  }}
                  title="Equal % vests each year (e.g., 10%, 20%, 30%...)"
                >
                  Linear vest
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => {
                    const y = config.bonus.vesting_years ?? config.surrender.years ?? 10;
                    // Common stepped pattern: 0% for first ~60% of years, then ramps to 100%
                    const cliff = Math.floor(y * 0.6);
                    const rampYears = y - cliff;
                    const arr = Array.from({ length: y }, (_, i) => {
                      if (i < cliff) return 0;
                      const stepIdx = i - cliff + 1;
                      return parseFloat(((stepIdx / rampYears) * 100).toFixed(1));
                    });
                    setVestingArray(arr);
                  }}
                  title="No vesting for first ~60% of years, then ramps to 100% (mimics Athene/Allianz)"
                >
                  Stepped (carrier-typical)
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => {
                    const y = config.bonus.vesting_years ?? config.surrender.years ?? 10;
                    // Cliff: 0% until last year, then 100%
                    const arr = Array.from({ length: y }, (_, i) => (i === y - 1 ? 100 : 0));
                    setVestingArray(arr);
                  }}
                  title="0% until the last year, then 100% in one step"
                >
                  Cliff vest
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {getVestingArray().map((pct, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">Yr {i + 1}</span>
                  <div className="relative w-full">
                    <Input
                      type="number" step="1" min="0" max="100"
                      value={pct}
                      onChange={(e) => handleVestingEdit(i, parseFloat(e.target.value) || 0)}
                      className="text-center text-sm h-9 pl-2 pr-5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              <strong className="font-semibold">Templates:</strong>{" "}
              <span className="font-medium">Linear vest</span> — equal % each year.{" "}
              <span className="font-medium">Stepped</span> — no vesting for the first ~60% of the period, then ramps up (e.g., Athene PE10: 0,0,0,0,0,0,20,40,60,80,100).{" "}
              <span className="font-medium">Cliff vest</span> — 0% until the last year, then 100% all at once.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Spacer to keep section grid layout consistent */}
          {config.bonus.type === "phased" && (
            <>
              <Field>
                <FieldLabel>Anniversary Rate %</FieldLabel>
                <Input
                  type="number" step="0.01" min="0" max="50"
                  value={config.bonus.anniversary_rate ?? ""}
                  onChange={(e) => updateConfig("bonus", { ...config.bonus, anniversary_rate: parseFloat(e.target.value) || null })}
                />
                <FieldDescription>Extra % credited each anniversary (on top of premium bonus).</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Anniversary Years</FieldLabel>
                <Input
                  type="number" min="0" max="20"
                  value={config.bonus.anniversary_years ?? ""}
                  onChange={(e) => updateConfig("bonus", { ...config.bonus, anniversary_years: parseInt(e.target.value) || null })}
                />
                <FieldDescription>How many anniversaries the bonus pays. E.g., 3 for years 1-3.</FieldDescription>
              </Field>
            </>
          )}
          {category === "income" && (
            <Field>
              <FieldLabel>Bonus Applies To</FieldLabel>
              <Select
                value={config.bonus.applies_to ?? "both"}
                onValueChange={(v) => updateConfig("bonus", { ...config.bonus, applies_to: v as "both" | "income_base" | "account_value" })}
              >
                <SelectTrigger>
                  <SelectValue>{BONUS_APPLIES_LABELS[config.bonus.applies_to ?? "both"]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both AV + Income Base</SelectItem>
                  <SelectItem value="income_base">Income Base only (boosts payout, not cash value)</SelectItem>
                  <SelectItem value="account_value">Account Value only (boosts cash value, not payout)</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>Where the bonus is credited on income products.</FieldDescription>
            </Field>
          )}
        </div>
      </section>

      {/* Surrender */}
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Surrender Charges</h3>
            <p className="text-xs text-muted-foreground/70 mt-1">
              The penalty % the carrier charges if the client withdraws beyond the free amount during the surrender period. After the period ends, withdrawals are penalty-free.
            </p>
          </div>
          {(initialSource === "ai_document" || initialSource === "ai_research") && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary shrink-0">
              <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {initialSource === "ai_document" ? "Extracted from your PDF" : "Auto-filled from web research"}
            </div>
          )}
        </div>

        <Field className="max-w-xs">
          <FieldLabel>Surrender Period (years)</FieldLabel>
          <Input
            type="number" min="0" max="30"
            value={config.surrender.years}
            onChange={(e) => handleSurrenderYearsChange(parseInt(e.target.value) || 0)}
          />
          <FieldDescription>E.g., 10 for a 10-year FIA. Changing this resizes the schedule below.</FieldDescription>
        </Field>

        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-medium">Surrender charge % by policy year</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enter each year&apos;s charge from the carrier&apos;s spec sheet, or use a quick template below.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => {
                  const y = config.surrender.years;
                  const schedule = Array.from({ length: y }, (_, i) => Math.max(0, y - i));
                  updateConfig("surrender", { ...config.surrender, schedule });
                }}
                title="Drops by 1% each year, e.g., 10, 9, 8, 7, 6..."
              >
                Even decline
              </Button>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => {
                  const y = config.surrender.years;
                  // Athene-style: starts high, holds for a few years, then declines
                  const startCharge = Math.min(12.5, Math.max(8, y + 2.5));
                  const schedule = Array.from({ length: y }, (_, i) => {
                    if (i < 2) return startCharge;
                    return Math.max(0, parseFloat((startCharge - (i - 1) * (startCharge / y)).toFixed(1)));
                  });
                  updateConfig("surrender", { ...config.surrender, schedule });
                }}
                title="Higher early charges that hold steady, then decline (mimics Athene/American Equity)"
              >
                Carrier-typical
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {config.surrender.schedule.map((charge, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground">Yr {i + 1}</span>
                <div className="relative w-full">
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={charge}
                    onChange={(e) => handleScheduleEdit(i, parseFloat(e.target.value) || 0)}
                    className="text-center text-sm h-9 pl-2 pr-5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            <strong className="font-semibold">Templates:</strong>{" "}
            <span className="font-medium">Even decline</span> drops 1% per year (e.g., 10, 9, 8, 7...). Use for generic illustrations.{" "}
            <span className="font-medium">Carrier-typical</span> stays high for 1-2 years then steps down (e.g., 12.5, 12.5, 11, 9, 7...) — common with Athene, American Equity, etc.
          </p>
        </div>
      </section>

      {/* Fees + Withdrawals */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fees &amp; Withdrawals</h3>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Ongoing rider fee deducted annually + how much the client can pull out without penalty.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Annual Rider Fee %</FieldLabel>
            <Input
              type="number" step="0.01" min="0" max="10"
              value={config.fees.annual_rider_fee}
              onChange={(e) => updateConfig("fees", { ...config.fees, annual_rider_fee: parseFloat(e.target.value) || 0 })}
            />
            <FieldDescription>Deducted from account value each year. Set to 0 if no rider fee.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Free Withdrawal %</FieldLabel>
            <Input
              type="number" step="0.1" min="0" max="100"
              value={config.withdrawals.penalty_free_percent}
              onChange={(e) => updateConfig("withdrawals", { ...config.withdrawals, penalty_free_percent: parseFloat(e.target.value) || 0 })}
            />
            <FieldDescription>% the client can withdraw each year with no surrender charge. Most FIAs allow 10% (Athene Base: 5%). When this product is selected on a client, the engine will plan conversions within this cap during the surrender period.</FieldDescription>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Year 1 Withdrawal Rule</FieldLabel>
            <Select
              value={config.withdrawals.year_1_rule}
              onValueChange={(v) => updateConfig("withdrawals", { ...config.withdrawals, year_1_rule: v as "same" | "interest_only" | "custom" })}
            >
              <SelectTrigger>
                <SelectValue>{YEAR_1_RULE_LABELS[config.withdrawals.year_1_rule]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same">Same as other years (10% from year 1)</SelectItem>
                <SelectItem value="interest_only">Interest only (no principal in year 1)</SelectItem>
                <SelectItem value="custom">Custom %</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>Some products restrict withdrawals more strictly in year 1.</FieldDescription>
          </Field>
          <Field orientation="horizontal" className="items-start pt-6 gap-2">
            <input
              type="checkbox"
              id="cumulative"
              className="mt-1 shrink-0"
              checked={config.withdrawals.cumulative_withdrawal}
              onChange={(e) => updateConfig("withdrawals", { ...config.withdrawals, cumulative_withdrawal: e.target.checked, cumulative_percent: e.target.checked ? 20 : null })}
            />
            <label htmlFor="cumulative" className="text-sm">
              Cumulative 20% withdrawal allowed
              <span className="block text-xs text-muted-foreground font-normal">
                Unused free withdrawal accumulates — can take 20% if none taken prior year.
              </span>
            </label>
          </Field>
        </div>
      </section>

      {/* Income (only for income products) */}
      {category === "income" && config.income && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Roll-up &amp; Income</h3>
            <p className="text-xs text-muted-foreground/70 mt-1">
              How the Income Base grows during deferral. The bigger the income base when the client turns income on, the bigger the lifetime payout.
            </p>
          </div>
          {config.income.roll_up_interest_multiple != null ? (
            // Performance-linked roll-up (e.g. Allianz 222 = 150% of credited
            // interest). Shown as a LOCKED display — the multiplier is set by the
            // platform to match the carrier illustration and isn't advisor-editable
            // (the engine ignores the fixed rate/type for these products).
            <Field>
              <FieldLabel className="flex items-center gap-1.5">
                Income Base Roll-up
                <Lock className="size-3 text-muted-foreground" />
              </FieldLabel>
              <Input
                value={`${Math.round(config.income.roll_up_interest_multiple * 100)}% of credited interest · ${config.income.roll_up_max_years}yr max`}
                disabled
                className="opacity-60 cursor-not-allowed bg-muted/30"
              />
              <FieldDescription className="text-xs">
                The income base grows by this multiple of the credited interest each
                year. Calibrated by the platform to the carrier illustration — not
                advisor-editable.
              </FieldDescription>
            </Field>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Roll-up Type</FieldLabel>
              <Select
                value={config.income.roll_up_type}
                onValueChange={(v) => updateConfig("income", { ...config.income!, roll_up_type: v as "simple" | "compound" })}
              >
                <SelectTrigger>
                  <SelectValue>{ROLL_UP_TYPE_LABELS[config.income.roll_up_type]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple — flat % of original</SelectItem>
                  <SelectItem value="compound">Compound — % grows on prior balance</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>Compound grows faster over time.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Roll-up Rate %</FieldLabel>
              <Input
                type="number" step="0.01" min="0" max="20"
                value={config.income.roll_up_rate}
                onChange={(e) => updateConfig("income", { ...config.income!, roll_up_rate: parseFloat(e.target.value) || 0 })}
              />
              <FieldDescription>Annual roll-up rate. Common: 6-10%.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Max Years</FieldLabel>
              <Input
                type="number" min="0" max="30"
                value={config.income.roll_up_max_years}
                onChange={(e) => updateConfig("income", { ...config.income!, roll_up_max_years: parseInt(e.target.value) || 0 })}
              />
              <FieldDescription>How long the roll-up runs. Most products cap at 10.</FieldDescription>
            </Field>
          </div>
          )}
          <FieldDescription className="text-xs">
            Custom payout factors (% paid by age) and split-rate roll-ups (e.g., 7% yrs 1-5, 4% yrs 6-10) are extracted automatically when you use AI research. For manual products, the engine uses payout factors from the matched archetype.
          </FieldDescription>
        </section>
      )}

      {/* Other */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Other</h3>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Optional product features that affect surrender value or projection assumptions.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field orientation="horizontal" className="items-start gap-2 pt-6">
            <input
              type="checkbox"
              id="mva"
              checked={config.other.mva_applies}
              onChange={(e) => updateConfig("other", { ...config.other, mva_applies: e.target.checked })}
              className="mt-1 shrink-0"
            />
            <label htmlFor="mva" className="text-sm">
              MVA applies
              <span className="block text-xs text-muted-foreground font-normal">
                Market Value Adjustment — early surrender value is adjusted up or down based on interest rates.
              </span>
            </label>
          </Field>
          <Field>
            <FieldLabel>Return of Premium After Year</FieldLabel>
            <Input
              type="number" min="0" max="30"
              placeholder="(none)"
              value={config.other.return_of_premium_year ?? ""}
              onChange={(e) => updateConfig("other", { ...config.other, return_of_premium_year: e.target.value ? parseInt(e.target.value) : null })}
            />
            <FieldDescription>Year after which surrender value is floored at premium paid. Leave blank if no ROP.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Default Rate of Return %</FieldLabel>
            <Input
              type="number" step="0.1" min="0" max="30"
              value={config.form_defaults?.rate_of_return ?? 7}
              onChange={(e) => updateConfig("form_defaults", { ...(config.form_defaults ?? {}), rate_of_return: parseFloat(e.target.value) || 0 })}
            />
            <FieldDescription>Pre-fills the projection rate when this product is selected. Advisors can override per client.</FieldDescription>
          </Field>
        </div>
      </section>

      {/* State Variations */}
      <StateVariationsSection
        config={config}
        onChange={(sa) => updateConfig("state_availability", sa)}
      />

      {error && (
        <div className="rounded-lg border border-red-300/40 bg-red-50/30 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400 whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {productId ? "Save Changes" : "Save Product"}
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// State Variations sub-component
// ===========================================================================

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function StateVariationsSection({
  config,
  onChange,
}: {
  config: ProductConfigPayload;
  onChange: (sa: ProductConfigPayload["state_availability"]) => void;
}) {
  const sa = config.state_availability ?? {
    not_available: [],
    bonus_overrides: {},
    age_overrides: {},
  };

  // Collect all states that have any kind of override
  const statesWithOverrides = new Set<string>([
    ...(sa.not_available ?? []),
    ...Object.keys(sa.bonus_overrides ?? {}),
    ...Object.keys(sa.age_overrides ?? {}),
    ...Object.keys(sa.surrender_overrides ?? {}),
    ...Object.keys(sa.vesting_overrides ?? {}),
    ...Object.keys(sa.mva_overrides ?? {}),
    ...Object.keys(sa.min_premium_overrides ?? {}),
  ]);

  const update = (patch: Partial<NonNullable<ProductConfigPayload["state_availability"]>>) => {
    onChange({
      ...sa,
      not_available: sa.not_available ?? [],
      bonus_overrides: sa.bonus_overrides ?? {},
      age_overrides: sa.age_overrides ?? {},
      ...patch,
    });
  };

  const toggleNotAvailable = (st: string) => {
    const cur = sa.not_available ?? [];
    const next = cur.includes(st) ? cur.filter((s) => s !== st) : [...cur, st];
    update({ not_available: next });
  };

  const setBonusOverride = (st: string, val: number | null) => {
    const next = { ...(sa.bonus_overrides ?? {}) };
    if (val == null || isNaN(val)) delete next[st]; else next[st] = val;
    update({ bonus_overrides: next });
  };

  const setMinPremiumOverride = (st: string, val: number | null) => {
    const next = { ...(sa.min_premium_overrides ?? {}) };
    if (val == null || isNaN(val)) delete next[st]; else next[st] = val;
    update({ min_premium_overrides: next });
  };

  const setAgeOverride = (st: string, val: number | null) => {
    const next = { ...(sa.age_overrides ?? {}) };
    if (val == null || isNaN(val)) delete next[st]; else next[st] = val;
    update({ age_overrides: next });
  };

  const setMvaOverride = (st: string, val: boolean | null) => {
    const next = { ...(sa.mva_overrides ?? {}) };
    if (val == null) delete next[st]; else next[st] = val;
    update({ mva_overrides: next });
  };

  const setSurrenderScheduleOverride = (st: string, schedule: number[] | null) => {
    const next = { ...(sa.surrender_overrides ?? {}) };
    if (schedule == null || schedule.length === 0) delete next[st]; else next[st] = schedule;
    update({ surrender_overrides: next });
  };

  const setVestingScheduleOverride = (st: string, schedule: number[] | null) => {
    const next = { ...(sa.vesting_overrides ?? {}) };
    if (schedule == null || schedule.length === 0) delete next[st]; else next[st] = schedule;
    update({ vesting_overrides: next });
  };

  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [addState, setAddState] = useState("");

  const addStateOverride = () => {
    if (!addState || statesWithOverrides.has(addState)) return;
    // Initialize with the base bonus % so the row appears
    setBonusOverride(addState, config.bonus.percentage);
    setExpandedState(addState);
    setAddState("");
  };

  const removeAllOverrides = (st: string) => {
    if (!confirm(`Remove all overrides for ${st}?`)) return;
    update({
      not_available: (sa.not_available ?? []).filter((s) => s !== st),
      bonus_overrides: Object.fromEntries(Object.entries(sa.bonus_overrides ?? {}).filter(([k]) => k !== st)),
      age_overrides: Object.fromEntries(Object.entries(sa.age_overrides ?? {}).filter(([k]) => k !== st)),
      mva_overrides: sa.mva_overrides ? Object.fromEntries(Object.entries(sa.mva_overrides).filter(([k]) => k !== st)) : undefined,
      surrender_overrides: sa.surrender_overrides ? Object.fromEntries(Object.entries(sa.surrender_overrides).filter(([k]) => k !== st)) : undefined,
      vesting_overrides: sa.vesting_overrides ? Object.fromEntries(Object.entries(sa.vesting_overrides).filter(([k]) => k !== st)) : undefined,
      min_premium_overrides: sa.min_premium_overrides ? Object.fromEntries(Object.entries(sa.min_premium_overrides).filter(([k]) => k !== st)) : undefined,
    });
  };

  return (
    <details className="group rounded-lg border border-border bg-muted/10">
      <summary className="cursor-pointer flex items-center justify-between gap-2 px-4 py-3 select-none list-none [&::-webkit-details-marker]:hidden hover:bg-muted/30 rounded-lg transition-colors">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">State Variations</h3>
          {statesWithOverrides.size > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
              {statesWithOverrides.size} {statesWithOverrides.size === 1 ? "state" : "states"} with overrides
            </span>
          )}
        </div>
        <svg className="size-4 text-muted-foreground transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className="px-4 pb-4 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Many FIAs vary by state — different bonus rates, surrender schedules, vesting curves, MVA, or unavailability. Add overrides only for states that differ from the base values above. Leave empty for states that follow the standard config.
        </p>

        {/* Add state */}
        <div className="flex items-end gap-2">
          <Field className="flex-1">
            <FieldLabel className="text-xs">Add a state with overrides</FieldLabel>
            <Select value={addState} onValueChange={(v) => setAddState(v ?? "")}>
              <SelectTrigger>
                <SelectValue>{addState || "Select state..."}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {US_STATES.filter((s) => !statesWithOverrides.has(s)).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="button" onClick={addStateOverride} disabled={!addState}>
            Add override
          </Button>
        </div>

        {/* States with overrides */}
        {statesWithOverrides.size === 0 && (
          <p className="text-sm text-muted-foreground italic py-3">
            No state variations. The product behaves identically in all states.
          </p>
        )}

        {Array.from(statesWithOverrides).sort().map((st) => {
          const isNA = (sa.not_available ?? []).includes(st);
          const isExpanded = expandedState === st;
          return (
            <div key={st} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedState(isExpanded ? null : st)}
                  className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
                >
                  <span className="font-mono">{st}</span>
                  {isNA && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400">Not available</span>}
                  <svg className={`size-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeAllOverrides(st)}
                  className="text-xs text-muted-foreground hover:text-red-600"
                >
                  Remove
                </button>
              </div>

              {isExpanded && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <Field orientation="horizontal" className="items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isNA}
                      onChange={() => toggleNotAvailable(st)}
                      id={`na-${st}`}
                      className="shrink-0"
                    />
                    <label htmlFor={`na-${st}`} className="text-sm">Not available in this state</label>
                  </Field>

                  {!isNA && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field>
                          <FieldLabel className="text-xs">Bonus % (override)</FieldLabel>
                          <Input
                            type="number" step="0.01" min="0" max="100"
                            value={sa.bonus_overrides?.[st] ?? ""}
                            placeholder={`Base: ${config.bonus.percentage}%`}
                            onChange={(e) => setBonusOverride(st, e.target.value === "" ? null : parseFloat(e.target.value))}
                          />
                        </Field>
                        <Field>
                          <FieldLabel className="text-xs">Max Issue Age (override)</FieldLabel>
                          <Input
                            type="number" min="0" max="120"
                            value={sa.age_overrides?.[st] ?? ""}
                            placeholder={`Base: ${config.other.max_issue_age ?? "—"}`}
                            onChange={(e) => setAgeOverride(st, e.target.value === "" ? null : parseInt(e.target.value))}
                          />
                        </Field>
                        <Field>
                          <FieldLabel className="text-xs">Min Premium $ (override)</FieldLabel>
                          <Input
                            type="number" min="0" step="100"
                            value={sa.min_premium_overrides?.[st] ?? ""}
                            placeholder={`Base: ${config.other.min_premium ? `$${config.other.min_premium.toLocaleString()}` : "—"}`}
                            onChange={(e) => setMinPremiumOverride(st, e.target.value === "" ? null : parseFloat(e.target.value))}
                          />
                        </Field>
                      </div>

                      <Field orientation="horizontal" className="items-center gap-2">
                        <input
                          type="checkbox"
                          id={`mva-${st}`}
                          checked={sa.mva_overrides?.[st] === false}
                          onChange={(e) => setMvaOverride(st, e.target.checked ? false : null)}
                          className="shrink-0"
                        />
                        <label htmlFor={`mva-${st}`} className="text-sm">MVA does NOT apply in this state (override)</label>
                      </Field>

                      <ScheduleOverrideField
                        label="Surrender schedule override (% per year)"
                        baseSchedule={config.surrender.schedule}
                        override={sa.surrender_overrides?.[st]}
                        onChange={(arr) => setSurrenderScheduleOverride(st, arr)}
                      />

                      {config.bonus.type === "vesting" && (
                        <ScheduleOverrideField
                          label="Vesting schedule override (% vested per year)"
                          baseSchedule={
                            Array.isArray(config.bonus.vesting_schedule)
                              ? config.bonus.vesting_schedule
                              : Array.from(
                                  { length: config.bonus.vesting_years ?? config.surrender.years },
                                  (_, i) => parseFloat((((i + 1) / (config.bonus.vesting_years ?? config.surrender.years)) * 100).toFixed(1))
                                )
                          }
                          override={sa.vesting_overrides?.[st]}
                          onChange={(arr) => setVestingScheduleOverride(st, arr)}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function ScheduleOverrideField({
  label,
  baseSchedule,
  override,
  onChange,
}: {
  label: string;
  baseSchedule: number[];
  override: number[] | undefined;
  onChange: (arr: number[] | null) => void;
}) {
  const isOverridden = !!override && override.length > 0;
  const display = override ?? baseSchedule;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel className="text-xs">{label}</FieldLabel>
        {isOverridden ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-red-600"
          >
            Reset to base
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange([...baseSchedule])}
            className="text-xs text-primary hover:underline"
          >
            Customize for this state
          </button>
        )}
      </div>
      {isOverridden && (
        <div className="grid grid-cols-5 gap-1.5">
          {display.map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-muted-foreground">Yr {i + 1}</span>
              <Input
                type="number" step="0.1" min="0" max="100"
                value={v}
                onChange={(e) => {
                  const next = [...display];
                  next[i] = parseFloat(e.target.value) || 0;
                  onChange(next);
                }}
                className="text-center text-xs h-8 px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
