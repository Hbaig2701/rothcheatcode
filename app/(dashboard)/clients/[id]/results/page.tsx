import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { MultiStrategyResults } from '@/components/results';

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch client name for display (minimal data, projection fetched client-side)
  const { data: client, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .single();

  if (error || !client) {
    notFound();
  }

  return (
    <div className="container py-6">
      <MultiStrategyResults clientId={client.id} clientName={client.name} />
    </div>
  );
}

export async function generateMetadata({ params }: ResultsPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', id)
    .single();

  return {
    title: client ? `Strategy Comparison - ${client.name}` : 'Strategy Comparison',
    description: 'Compare 4 Roth conversion strategies side-by-side',
  };
}
