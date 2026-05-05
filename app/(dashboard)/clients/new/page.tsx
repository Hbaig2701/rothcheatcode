import { ClientForm } from "@/components/clients/client-form";

// Form sections use a 1/2/3 column responsive grid (sm:grid-cols-2 →
// lg:grid-cols-3). 800px max-width let the 2-col layout in but never
// triggered the 3-col layout, so radio groups + helper text columns
// ended up crammed and stacked. Bumped to 1400px so wider sections get
// the third column they were designed for, while still giving the form
// a comfortable centered presentation on ultrawide screens.
export default function NewClientPage() {
  return (
    <div className="p-9 max-w-[1400px] mx-auto w-full">
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
