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
      <div className="container py-8 max-w-2xl">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="container py-8 max-w-2xl">
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
    <div className="container py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Edit Client</h1>
        <p className="text-muted-foreground">
          Update {client.name}&apos;s information.
        </p>
      </div>
      <ClientForm client={client} />
    </div>
  );
}
