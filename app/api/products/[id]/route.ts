import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCustomProduct,
  updateCustomProduct,
  deleteCustomProduct,
  countClientsUsingCustomProduct,
} from "@/lib/products/repository";
import { updateCustomProductSchema } from "@/lib/products/validators";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const product = await getCustomProduct(user.id, id);
    if (!product) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(product);
  } catch (err) {
    console.error(`[GET /api/products/${id}] error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
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

  const parsed = updateCustomProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await updateCustomProduct(user.id, id, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[PUT /api/products/${id}] error:`, err);
    const message = err instanceof Error ? err.message : "Internal server error";
    if (message.includes("duplicate key") || message.includes("custom_products_user_name_unique")) {
      return NextResponse.json(
        { error: "A product with that name already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";

  try {
    const inUse = await countClientsUsingCustomProduct(user.id, id);
    if (inUse > 0 && !force) {
      return NextResponse.json(
        {
          error: "Product in use",
          message: `${inUse} client${inUse === 1 ? "" : "s"} reference this product. Delete with ?force=true to proceed (clients will fall back to their stored blueprint_type).`,
          clientsUsingProduct: inUse,
        },
        { status: 409 }
      );
    }

    await deleteCustomProduct(user.id, id);
    return NextResponse.json({ ok: true, clientsAffected: inUse });
  } catch (err) {
    console.error(`[DELETE /api/products/${id}] error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
