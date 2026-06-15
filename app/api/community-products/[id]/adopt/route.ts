import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adoptCommunityProduct, CommunityAdoptError } from "@/lib/products/community-repository";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

// POST /api/community-products/[id]/adopt — copy a catalog product into My Products
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const created = await adoptCommunityProduct(user.id, id);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof CommunityAdoptError) {
      // not_found -> 404; duplicate_name -> 409 (advisor already has it)
      const status = err.code === "not_found" ? 404 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error(`[POST /api/community-products/${id}/adopt] error:`, err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
