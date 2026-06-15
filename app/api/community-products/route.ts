import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCommunityProducts } from "@/lib/products/community-repository";

export const dynamic = "force-dynamic";

// GET /api/community-products — list the published Community catalog
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const products = await listCommunityProducts();
    return NextResponse.json({
      products,
      growth: products.filter((p) => p.category === "growth"),
      income: products.filter((p) => p.category === "income"),
    });
  } catch (err) {
    console.error("[GET /api/community-products] error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
