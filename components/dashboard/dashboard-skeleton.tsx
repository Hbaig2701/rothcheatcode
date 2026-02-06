"use client";

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-[rgba(255,255,255,0.04)] rounded ${className ?? ""}`} />;
}

function CardSkeleton() {
  return (
    <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-[22px_24px]">
      <Pulse className="w-9 h-9 rounded-[10px] mb-4" />
      <Pulse className="h-3 w-24 mb-3" />
      <Pulse className="h-7 w-20 mb-2" />
      <Pulse className="h-3 w-32" />
    </div>
  );
}

function PanelSkeleton({ height }: { height: string }) {
  return (
    <div className={`bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-7 ${height}`}>
      <Pulse className="h-3 w-32 mb-6" />
      <Pulse className="h-5 w-48 mb-4" />
      <Pulse className="h-5 w-40 mb-4" />
      <Pulse className="h-5 w-44 mb-4" />
      <Pulse className="h-5 w-36" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-7">
      {/* Header skeleton */}
      <div className="flex justify-between items-center mb-9">
        <div>
          <Pulse className="h-8 w-64 mb-2" />
          <Pulse className="h-4 w-44" />
        </div>
        <Pulse className="h-5 w-28" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelSkeleton height="h-72" />
        <PanelSkeleton height="h-72" />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelSkeleton height="h-64" />
        <PanelSkeleton height="h-64" />
      </div>

      {/* Pipeline skeleton */}
      <div className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] rounded-[14px] p-6">
        <Pulse className="h-3 w-40 mb-4" />
        <Pulse className="h-4 w-72 mb-6" />
        <Pulse className="h-8 w-full mb-3" />
        <Pulse className="h-8 w-full mb-3" />
        <Pulse className="h-8 w-full" />
      </div>
    </div>
  );
}
