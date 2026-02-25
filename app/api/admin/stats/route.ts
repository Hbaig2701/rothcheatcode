import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel
    const [advisors, clients, scenarioRuns, exports, weekAdvisors, weekClients, weekRuns, weekExports] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'advisor'),
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('calculation_log').select('id', { count: 'exact', head: true }),
      supabase.from('export_log').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'advisor').gte('created_at', weekAgo),
      supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('calculation_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('export_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ]);

    return NextResponse.json({
      totalAdvisors: advisors.count ?? 0,
      totalClients: clients.count ?? 0,
      totalScenarioRuns: scenarioRuns.count ?? 0,
      totalExports: exports.count ?? 0,
      trendsThisWeek: {
        advisors: weekAdvisors.count ?? 0,
        clients: weekClients.count ?? 0,
        scenarioRuns: weekRuns.count ?? 0,
        exports: weekExports.count ?? 0,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
