"use client";

import { User } from "@supabase/supabase-js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUserSettings } from "@/lib/queries/settings";
import {
  User as UserIcon,
  Shield,
  Building2,
  SlidersHorizontal,
  CreditCard,
  Loader2,
} from "lucide-react";
import { ProfileTab } from "./tabs/profile-tab";
import { SecurityTab } from "./tabs/security-tab";
import { BusinessTab } from "./tabs/business-tab";
import { DefaultsTab } from "./tabs/defaults-tab";
import { BillingTab } from "./tabs/billing-tab";

const TABS = [
  { value: "profile", label: "Profile", icon: UserIcon },
  { value: "security", label: "Security", icon: Shield },
  { value: "business", label: "Business & Logo", icon: Building2 },
  { value: "defaults", label: "Default Values", icon: SlidersHorizontal },
  { value: "billing", label: "Billing", icon: CreditCard, disabled: false },
] as const;

export function SettingsContent({ user }: { user: User }) {
  const { data: settings, isLoading, error } = useUserSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-[rgba(255,255,255,0.25)]" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="rounded-[14px] border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.08)] p-6">
        <p className="text-[#f87171]">
          Failed to load settings. Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="p-9 max-w-5xl">
      <h1 className="font-display text-[30px] font-normal text-white mb-9">Settings</h1>

      <div className="flex gap-8">
        {/* Left Tab Navigation */}
        <Tabs defaultValue="profile" orientation="vertical" className="flex gap-8 w-full">
          <TabsList variant="line" className="w-[200px] shrink-0 flex-col items-stretch gap-1 bg-transparent p-0 border-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="justify-start gap-2.5 h-11 px-3.5 rounded-lg text-sm font-normal text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.04)] data-[state=active]:bg-[rgba(212,175,55,0.08)] data-[state=active]:text-gold data-[state=active]:border data-[state=active]:border-[rgba(212,175,55,0.2)] border border-transparent transition-all"
              >
                <tab.icon className="size-4 opacity-70" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Right Content Card */}
          <div className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[16px] p-9">
            <TabsContent value="profile" className="mt-0">
              <ProfileTab user={user} settings={settings} />
            </TabsContent>
            <TabsContent value="security" className="mt-0">
              <SecurityTab user={user} />
            </TabsContent>
            <TabsContent value="business" className="mt-0">
              <BusinessTab settings={settings} />
            </TabsContent>
            <TabsContent value="defaults" className="mt-0">
              <DefaultsTab settings={settings} />
            </TabsContent>
            <TabsContent value="billing" className="mt-0">
              <BillingTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
