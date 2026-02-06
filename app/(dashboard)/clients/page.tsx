"use client";

import { useState } from "react";
import { useClients } from "@/lib/queries/clients";
import { ClientCard } from "@/components/clients/client-card";
import { ClientsEmptyState } from "@/components/clients/clients-empty-state";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Search } from "lucide-react";

export default function ClientsPage() {
  const { data: clients, isLoading, isError, error } = useClients();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="p-9">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[rgba(255,255,255,0.25)]" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-9">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <h2 className="text-lg font-semibold text-[#f87171] mb-2">
            Failed to load clients
          </h2>
          <p className="text-[rgba(255,255,255,0.5)] mb-4">
            {error?.message || "An unexpected error occurred"}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const hasClients = clients && clients.length > 0;

  // Filter clients by search
  const filteredClients = hasClients
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div className="p-9">
      {/* Page header */}
      <div className="flex items-center justify-between mb-9">
        <div>
          <h1 className="font-display text-[30px] font-normal text-white">Clients</h1>
          <p className="text-base text-[rgba(255,255,255,0.6)] mt-1.5">
            {clients?.length || 0} clients total
          </p>
        </div>
        {hasClients && (
          <a
            href="/clients/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0c0c0c] bg-gold rounded-[10px] hover:bg-[rgba(212,175,55,0.9)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Client
          </a>
        )}
      </div>

      {/* Search */}
      {hasClients && (
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[rgba(255,255,255,0.4)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-11 pr-4 py-3 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] rounded-[10px] text-base text-white placeholder:text-[rgba(255,255,255,0.4)] focus:outline-none focus:border-[rgba(212,175,55,0.3)] transition-colors"
          />
        </div>
      )}

      {/* Content */}
      {hasClients ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              delta={Math.floor(Math.random() * 20) - 5} // TODO: Calculate actual delta from projections
            />
          ))}
        </div>
      ) : (
        <ClientsEmptyState />
      )}

      {/* No results message */}
      {hasClients && filteredClients.length === 0 && search && (
        <div className="text-center py-16">
          <p className="text-[rgba(255,255,255,0.5)]">
            No clients found matching &quot;{search}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
