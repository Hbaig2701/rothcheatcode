import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Account deletion has been removed.
// Users should cancel their subscription via Stripe billing portal instead.
export async function DELETE() {
  return NextResponse.json(
    { error: "Account deletion is not available. Please cancel your subscription from the billing settings." },
    { status: 403 }
  );
}
