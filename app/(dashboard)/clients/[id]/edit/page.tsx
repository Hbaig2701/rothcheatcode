"use client";

import { use } from "react";
import { useClient } from "@/lib/queries/clients";
import { ClientForm } from "@/components/clients/client-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditClientPageProps {
  params: Promise<{ id: string }>;
}

export default function EditClientPage({ params }: EditClientPageProps) {
  const { id } = use(params);
  const { data: client, isLoading, isError, error } = useClient(id);

  if (isLoading) {
    return (
      <div className="p-9 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="p-9 max-w-[1400px] mx-auto w-full">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <h2 className="text-lg font-semibold text-red-600 mb-2">
            Failed to load client
          </h2>
          <p className="text-muted-foreground mb-4">
            {error?.message || "Client not found"}
          </p>
          <Button variant="outline" render={<a href="/clients" />}>
            Back to clients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-9 max-w-[1400px] mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Edit Client</h1>
        <p className="text-muted-foreground">
          Update {client.name}&apos;s information.
        </p>
      </div>
      {/*
        Key on updated_at so the form re-initializes when the underlying record
        changes. ClientForm seeds react-hook-form via `defaultValues`, which is
        read ONCE at mount — but useClient() serves stale-while-revalidate, so on
        open the form can mount from a stale cached copy (e.g. legacy mode off
        from a prior view) and the background refetch's fresh `client` prop never
        re-syncs. That made gi_legacy_mode (and any field) display the stale value
        — the toggle appearing to "randomly untick" even though the DB was correct.
        When the refetch returns a newer updated_at the key changes and the form
        remounts from fresh data; an unchanged updated_at (same-record refetch,
        e.g. window-focus) keeps the key stable so in-progress edits aren't lost.
      */}
      <ClientForm key={`${client.id}-${client.updated_at}`} client={client} />
    </div>
  );
}
