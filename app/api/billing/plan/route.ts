import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getEffectivePlan } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await getEffectivePlan(user.id);
  return NextResponse.json({ plan });
}
