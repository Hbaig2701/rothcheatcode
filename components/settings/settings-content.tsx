"use client";

import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUserSettings } from "@/lib/queries/settings";
import {
  User as UserIcon,
  Shield,
  Building2,
  SlidersHorizontal,
  CreditCard,
  Users,
  Palette,
  Loader2,
} from "lucide-react";
import { ProfileTab } from "./tabs/profile-tab";
import { SecurityTab } from "./tabs/security-tab";
import { BusinessTab } from "./tabs/business-tab";
import { DefaultsTab } from "./tabs/defaults-tab";
import { BillingTab } from "./tabs/billing-tab";
import { TeamTab } from "./tabs/team-tab";
import { AppearanceTab } from "./tabs/appearance-tab";

interface TabDef {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const BASE_TABS: TabDef[] = [
  { value: "profile", label: "Profile", icon: UserIcon },
  { value: "security", label: "Security", icon: Shield },
  { value: "business", label: "Business & Logo", icon: Building2 },
  { value: "defaults", label: "Default Values", icon: SlidersHorizontal },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "billing", label: "Billing", icon: CreditCard },
];

const TEAM_TAB: TabDef = { value: "team", label: "Team", icon: Users };

export function SettingsContent({ user }: { user: User }) {
  const { data: settings, isLoading, error } = useUserSettings();
  const [plan, setPlan] = useState<string | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [teamMemberRole, setTeamMemberRole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/usage")
      .then((r) => r.json())
      .then((data) => {
        setPlan(data.plan);
        setIsTeamMember(data.isTeamMember);
        setTeamMemberRole(data.teamMemberRole);
      })
      .catch(() => {});
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-text-dim" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="rounded-[14px] border border-red/20 bg-red-bg p-6">
        <p className="text-red">
          Failed to load settings. Please try refreshing the page.
        </p>
      </div>
    );
  }

  // Show Team tab for plan owners and admin team members
  const showTeamTab = plan && (!isTeamMember || teamMemberRole === "admin");
  const tabs = showTeamTab ? [...BASE_TABS, TEAM_TAB] : BASE_TABS;

  return (
    <div className="p-9 max-w-5xl">
      <h1 className="font-display text-[30px] font-normal text-foreground mb-9">Settings</h1>

      <div className="flex gap-8">
        {/* Left Tab Navigation */}
        <Tabs defaultValue="profile" orientation="vertical" className="flex gap-8 w-full">
          <TabsList variant="line" className="w-[200px] shrink-0 flex-col items-stretch gap-1 bg-transparent p-0 border-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="justify-start gap-2.5 h-11 px-3.5 rounded-lg text-sm font-normal text-muted-foreground hover:bg-secondary data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:border data-[state=active]:border-gold-border border border-transparent transition-all"
              >
                <tab.icon className="size-4 opacity-70" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Right Content Card */}
          <div className="flex-1 bg-bg-card border border-border-default rounded-[16px] p-9">
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
            <TabsContent value="appearance" className="mt-0">
              <AppearanceTab />
            </TabsContent>
            <TabsContent value="billing" className="mt-0">
              <BillingTab />
            </TabsContent>
            {showTeamTab && (
              <TabsContent value="team" className="mt-0">
                <TeamTab plan={plan!} isTeamAdmin={isTeamMember && teamMemberRole === "admin"} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
