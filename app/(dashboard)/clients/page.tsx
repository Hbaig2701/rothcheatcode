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
          <Loader2 className="h-8 w-8 animate-spin text-text-dim" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-9">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <h2 className="text-lg font-semibold text-red mb-2">
            Failed to load clients
          </h2>
          <p className="text-text-muted mb-4">
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
          <h1 className="font-display text-[30px] font-normal text-foreground">Clients</h1>
          <p className="text-base text-text-dim mt-1.5">
            {clients?.length || 0} clients total
          </p>
        </div>
        {hasClients && (
          <a
            href="/clients/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-gold rounded-[10px] hover:bg-[rgba(212,175,55,0.9)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Client
          </a>
        )}
      </div>

      {/* Search */}
      {hasClients && (
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-11 pr-4 py-3 bg-bg-input border border-border-default rounded-[10px] text-base text-foreground placeholder:text-text-dim focus:outline-none focus:border-border-hover transition-colors"
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
              delta={(client as any).delta ?? 0}
            />
          ))}
        </div>
      ) : (
        <ClientsEmptyState />
      )}

      {/* No results message */}
      {hasClients && filteredClients.length === 0 && search && (
        <div className="text-center py-16">
          <p className="text-text-muted">
            No clients found matching &quot;{search}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
