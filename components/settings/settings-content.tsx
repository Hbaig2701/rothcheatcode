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
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <p className="text-destructive">
          Failed to load settings. Please try refreshing the page.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <Tabs defaultValue="profile" orientation="vertical">
        <TabsList variant="line" className="w-48 shrink-0">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <tab.icon className="size-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 flex-1 pl-6">
          <TabsContent value="profile">
            <ProfileTab user={user} settings={settings} />
          </TabsContent>
          <TabsContent value="security">
            <SecurityTab user={user} />
          </TabsContent>
          <TabsContent value="business">
            <BusinessTab settings={settings} />
          </TabsContent>
          <TabsContent value="defaults">
            <DefaultsTab settings={settings} />
          </TabsContent>
          <TabsContent value="billing">
            <BillingTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
