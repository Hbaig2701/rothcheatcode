import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { redirect } from "next/navigation";
import { OnboardingFunnel } from "./_components/onboarding-funnel";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireAdmin(supabase, user);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Onboarding video funnel
          </h1>
          <p className="text-sm text-text-dim mt-1 max-w-2xl">
            Who&apos;s watched the 30-minute onboarding video, who dismissed it
            without watching, and who hasn&apos;t engaged at all. Drives the
            first-login takeover modal.
          </p>
        </div>
        <Link
          href="/admin"
          className="text-sm text-text-dim hover:text-foreground transition-colors"
        >
          ← Admin
        </Link>
      </div>
      <OnboardingFunnel />
    </div>
  );
}
