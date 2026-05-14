import { ClientForm } from "@/components/clients/client-form";
import { CAST, type CastId } from "@/lib/training/cast";

const VALID_PREFILLS: CastId[] = ['bob', 'mary', 'joneses'];

// Form sections use a 1/2/3 column responsive grid (sm:grid-cols-2 →
// lg:grid-cols-3). 800px max-width let the 2-col layout in but never
// triggered the 3-col layout, so radio groups + helper text columns
// ended up crammed and stacked. Bumped to 1400px so wider sections get
// the third column they were designed for, while still giving the form
// a comfortable centered presentation on ultrawide screens.
export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { prefill } = await searchParams;
  const castId = prefill && VALID_PREFILLS.includes(prefill as CastId)
    ? (prefill as CastId)
    : undefined;
  const defaults = castId ? CAST[castId] : undefined;

  return (
    <div className="p-9 max-w-[1400px] mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Add New Client</h1>
        <p className="text-muted-foreground">
          {castId
            ? `Pre-filled from the training cast — review and adjust as needed, then save as a real client.`
            : `Enter the client's basic information to get started.`}
        </p>
      </div>
      <ClientForm defaults={defaults} />
    </div>
  );
}
