"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardData } from "@/lib/types/dashboard";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  data: () => [...dashboardKeys.all, "data"] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.data(),
    queryFn: async (): Promise<DashboardData> => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to fetch dashboard" }));
        throw new Error(error.error || "Failed to fetch dashboard data");
      }
      return res.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
