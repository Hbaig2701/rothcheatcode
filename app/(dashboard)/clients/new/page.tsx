import { ClientForm } from "@/components/clients/client-form";

export default function NewClientPage() {
  return (
    <div className="container py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Add New Client</h1>
        <p className="text-muted-foreground">
          Enter the client&apos;s basic information to get started.
        </p>
      </div>
      <ClientForm />
    </div>
  );
}
