"use client";

import { use } from "react";
import { useClient } from "@/lib/queries/clients";
import { InputSidebar } from "@/components/report/input-sidebar";
import { ReportDashboard } from "@/components/report/report-dashboard";
import { Loader2 } from "lucide-react";

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { id } = use(params);
  const { data: client, isLoading } = useClient(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-[#A0A0A0]" />
      </div>
    );
  }

  if (!client) {
    return <div className="p-8 text-white">Client not found</div>;
  }

  return (
    <div className="flex w-full h-[calc(100vh-4rem)] overflow-hidden bg-black">
      {/* Left Sidebar: Inputs */}
      <div className="w-[350px] shrink-0 h-full border-r border-[#2A2A2A] bg-[#0A0A0A] overflow-hidden">
        <InputSidebar client={client} />
      </div>

      {/* Right Content: Report Dashboard */}
      <div className="flex-1 h-full overflow-hidden">
        <ReportDashboard clientId={id} />
      </div>
    </div>
  );
}
