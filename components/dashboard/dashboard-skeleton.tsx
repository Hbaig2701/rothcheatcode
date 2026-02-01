"use client";

function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-[#2A2A2A] rounded ${className ?? ""}`} />;
}

function CardSkeleton() {
  return (
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
      <Pulse className="w-10 h-10 rounded-[10px] mb-3" />
      <Pulse className="h-3 w-24 mb-3" />
      <Pulse className="h-8 w-20 mb-2" />
      <Pulse className="h-3 w-32" />
    </div>
  );
}

function PanelSkeleton({ height }: { height: string }) {
  return (
    <div className={`bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 ${height}`}>
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
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <Pulse className="h-8 w-64" />
        <Pulse className="h-5 w-28" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PanelSkeleton height="h-72" />
        <PanelSkeleton height="h-72" />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PanelSkeleton height="h-64" />
        <PanelSkeleton height="h-64" />
      </div>

      {/* Pipeline skeleton */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6">
        <Pulse className="h-3 w-40 mb-4" />
        <Pulse className="h-4 w-72 mb-6" />
        <Pulse className="h-8 w-full mb-3" />
        <Pulse className="h-8 w-full mb-3" />
        <Pulse className="h-8 w-full" />
      </div>
    </div>
  );
}
