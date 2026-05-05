import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCustomProduct, updateCustomProduct } from "@/lib/products/repository";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

// PATCH /api/products/[id]/favorite — toggle favorite
export async function PATCH(_req: NextRequest, ctx: Ctx) {
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
    const updated = await updateCustomProduct(user.id, id, {
      is_favorite: !product.is_favorite,
    });
    return NextResponse.json({ id: updated.id, is_favorite: updated.is_favorite });
  } catch (err) {
    console.error(`[PATCH /api/products/${id}/favorite] error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
