import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Test accounts to exclude from all metrics
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];

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

    // Use admin client (bypasses RLS) for cross-user queries
    const admin = createAdminClient();

    // Get test account IDs to exclude from all metrics
    const { data: testProfiles } = await admin
      .from('profiles')
      .select('id')
      .in('email', TEST_EMAILS);
    const testIds = (testProfiles ?? []).map(p => p.id);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel (excluding test accounts)
    const advisorQuery = admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'advisor').not('email', 'in', `(${TEST_EMAILS.join(',')})`);
    const weekAdvisorQuery = admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'advisor').not('email', 'in', `(${TEST_EMAILS.join(',')})`).gte('created_at', weekAgo);

    // For clients/projections/exports, exclude by user_id if test accounts exist
    let clientQuery = admin.from('clients').select('id', { count: 'exact', head: true });
    let runQuery = admin.from('projections').select('id', { count: 'exact', head: true });
    let exportQuery = admin.from('export_log').select('id', { count: 'exact', head: true });
    let weekClientQuery = admin.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);
    let weekRunQuery = admin.from('projections').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);
    let weekExportQuery = admin.from('export_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);

    if (testIds.length > 0) {
      const excludeList = `(${testIds.join(',')})`;
      clientQuery = clientQuery.not('user_id', 'in', excludeList);
      runQuery = runQuery.not('user_id', 'in', excludeList);
      exportQuery = exportQuery.not('user_id', 'in', excludeList);
      weekClientQuery = weekClientQuery.not('user_id', 'in', excludeList);
      weekRunQuery = weekRunQuery.not('user_id', 'in', excludeList);
      weekExportQuery = weekExportQuery.not('user_id', 'in', excludeList);
    }

    const [advisors, clients, scenarioRuns, exports, weekAdvisors, weekClients, weekRuns, weekExports] = await Promise.all([
      advisorQuery,
      clientQuery,
      runQuery,
      exportQuery,
      weekAdvisorQuery,
      weekClientQuery,
      weekRunQuery,
      weekExportQuery,
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
