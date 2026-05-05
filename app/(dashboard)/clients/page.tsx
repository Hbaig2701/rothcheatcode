"use client";

import { useEffect, useState } from "react";
import { useClients, useDeleteClient } from "@/lib/queries/clients";
import { ClientCard } from "@/components/clients/client-card";
import { ClientsListView } from "@/components/clients/clients-list-view";
import { ClientsEmptyState } from "@/components/clients/clients-empty-state";
import { IntakeLinkModal } from "@/components/clients/intake-link-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Plus, Loader2, Search, UserPlus, Link2, ChevronDown, LayoutGrid, List } from "lucide-react";

type ClientsView = "grid" | "list";
const VIEW_STORAGE_KEY = "clients-view";

export default function ClientsPage() {
  const { data: clients, isLoading, isError, error } = useClients();
  const deleteClient = useDeleteClient();
  const [search, setSearch] = useState("");
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  // View preference is per-browser. Default to grid; load saved choice on mount
  // (deferred so the initial server render doesn't try to read localStorage).
  const [view, setView] = useState<ClientsView>("grid");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "list" || saved === "grid") setView(saved);
  }, []);
  const updateView = (next: ClientsView) => {
    setView(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    }
  };

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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-gold rounded-[10px] hover:bg-primary/90 transition-colors cursor-pointer">
                  <Plus className="h-4 w-4" />
                  Add Client
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => window.location.href = "/clients/new"}>
                <UserPlus className="h-4 w-4 mr-2" />
                Create client manually
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIntakeModalOpen(true)}>
                <Link2 className="h-4 w-4 mr-2" />
                Generate client questionnaire
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Search + view toggle */}
      {hasClients && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-11 pr-4 py-3 bg-bg-input border border-border-default rounded-[10px] text-base text-foreground placeholder:text-text-dim focus:outline-none focus:border-border-hover transition-colors"
            />
          </div>
          {/* Grid / List toggle. Selection is persisted to localStorage so
              advisors who prefer the dense list view get it on every visit. */}
          <div className="inline-flex rounded-[10px] border border-border-default bg-bg-input p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => updateView("grid")}
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                view === "grid"
                  ? "bg-bg-card text-foreground shadow-sm"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => updateView("list")}
              aria-pressed={view === "list"}
              aria-label="List view"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                view === "list"
                  ? "bg-bg-card text-foreground shadow-sm"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {hasClients ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                delta={(client as any).delta ?? 0}
                onDelete={(id) => deleteClient.mutate(id)}
              />
            ))}
          </div>
        ) : (
          <ClientsListView
            clients={filteredClients as never}
            onDelete={(id) => deleteClient.mutate(id)}
          />
        )
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

      <IntakeLinkModal
        open={intakeModalOpen}
        onClose={() => setIntakeModalOpen(false)}
      />
    </div>
  );
}
