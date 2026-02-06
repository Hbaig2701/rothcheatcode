"use client";

import { useProjection } from "@/lib/queries/projections";
import { useClient } from "@/lib/queries/clients";
import { Skeleton } from "@/components/ui/skeleton";
import { isGuaranteedIncomeProduct, type FormulaType } from "@/lib/config/products";
import { GIReportDashboard } from "@/components/report/gi-report-dashboard";
import { GrowthReportDashboard } from "@/components/report/growth-report-dashboard";

interface ReportDashboardProps {
    clientId: string;
}

export function ReportDashboard({ clientId }: ReportDashboardProps) {
    const { data: client, isLoading: clientLoading } = useClient(clientId);
    const { data: projectionResponse, isLoading: projectionLoading } = useProjection(clientId);

    if (clientLoading || projectionLoading) {
        return (
            <div className="p-9 space-y-4 h-full">
                <Skeleton className="h-12 w-full bg-[rgba(255,255,255,0.025)]" />
                <Skeleton className="h-64 w-full bg-[rgba(255,255,255,0.025)]" />
            </div>
        );
    }

    if (!client || !projectionResponse?.projection) {
        return (
            <div className="p-9 h-full text-[rgba(255,255,255,0.5)]">
                No data available. Please recalculate.
            </div>
        );
    }

    const { projection } = projectionResponse;
    const isGI = client.blueprint_type
        ? isGuaranteedIncomeProduct(client.blueprint_type as FormulaType)
        : false;

    // Render GI-specific dashboard for Guaranteed Income products
    if (isGI) {
        return <GIReportDashboard client={client} projection={projection} />;
    }

    // Render Growth dashboard for Growth products (non-GI)
    return <GrowthReportDashboard client={client} projection={projection} />;
}
