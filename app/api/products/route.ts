import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCustomProducts, createCustomProduct } from "@/lib/products/repository";
import { createCustomProductSchema } from "@/lib/products/validators";
import { ALL_PRODUCTS, GROWTH_PRODUCTS, GUARANTEED_INCOME_PRODUCTS } from "@/lib/config/products";
import type { ProductListItem } from "@/lib/products/types";

export const dynamic = "force-dynamic";

// GET /api/products — list all available products (system + custom)
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const customProducts = await listCustomProducts(user.id);

    const systemItems: ProductListItem[] = Object.values(ALL_PRODUCTS).map((p) => ({
      id: p.id,
      name: p.label,
      category: p.id in GROWTH_PRODUCTS ? "growth" : "income",
      isSystem: true,
      isFavorite: false,
      engine_preset: p.id,
      archetype: null,
    }));

    const customItems: ProductListItem[] = customProducts.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      isSystem: false,
      isFavorite: p.is_favorite,
      engine_preset: p.engine_preset,
      archetype: p.archetype,
    }));

    return NextResponse.json({
      system: systemItems,
      custom: customItems,
      // Helper groupings for UI
      growth: [...systemItems, ...customItems].filter((p) => p.category === "growth"),
      income: [...systemItems, ...customItems].filter((p) => p.category === "income"),
      favorites: customItems.filter((p) => p.isFavorite),
      // Full custom rows (for edit/manage flows)
      customDetailed: customProducts,
    });
  } catch (err) {
    console.error("[GET /api/products] error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/products — create a custom product
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createCustomProductSchema.safeParse(body);
  if (!parsed.success) {
    // Surface a path-aware list of issues. flatten() collapses nested
    // errors under their top-level key (e.g. all config.* errors land in
    // fieldErrors.config), which is useless for advisor-facing UI. issues[]
    // preserves the full path so the form can show "config.state_availability.age_overrides — Required".
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    console.warn("[POST /api/products] validation failed", {
      user_id: user.id,
      issues,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten(), issues },
      { status: 400 }
    );
  }

  try {
    const created = await createCustomProduct(user.id, parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/products] error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    // Unique violation = duplicate name
    if (message.includes("duplicate key") || message.includes("custom_products_user_name_unique")) {
      return NextResponse.json(
        { error: `A product named "${parsed.data.name}" already exists. Choose a different name.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
