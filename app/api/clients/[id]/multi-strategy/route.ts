import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { runMultiStrategySimulation } from '@/lib/calculations';
import { Client } from '@/lib/types/client';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch client data
  const { data: client, error: fetchError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !client) {
    const status = fetchError?.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? 'Client not found' : 'Failed to fetch client' },
      { status }
    );
  }

  // Run multi-strategy simulation
  const currentYear = new Date().getFullYear();
  const projectionYears = client.projection_years || 40;

  try {
    const result = runMultiStrategySimulation(
      client as Client,
      currentYear,
      currentYear + projectionYears
    );

    return NextResponse.json({
      result,
      cached: false // Could implement caching layer later
    });
  } catch (error) {
    console.error('Multi-strategy calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate projections' },
      { status: 500 }
    );
  }
}
