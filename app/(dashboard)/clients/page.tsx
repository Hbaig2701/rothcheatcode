"use client";

import { useClients } from "@/lib/queries/clients";
import { ClientsTable } from "@/components/clients/clients-table";
import { ClientsEmptyState } from "@/components/clients/clients-empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import Link from "next/link";

export default function ClientsPage() {
  const { data: clients, isLoading, isError, error } = useClients();

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container py-8">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <h2 className="text-lg font-semibold text-red-600 mb-2">
            Failed to load clients
          </h2>
          <p className="text-muted-foreground mb-4">
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

  return (
    <div className="container py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">
            Manage your clients and their Roth conversion projections.
          </p>
        </div>
        {hasClients && (
          <Link href="/clients/new" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" />
            Add client
          </Link>
        )}
      </div>

      {/* Content */}
      {hasClients ? (
        <ClientsTable data={clients} />
      ) : (
        <ClientsEmptyState />
      )}
    </div>
  );
}
