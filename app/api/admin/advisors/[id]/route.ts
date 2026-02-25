import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: advisorId } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use admin client (bypasses RLS) for cross-user queries
    const admin = createAdminClient();

    // Fetch advisor profile
    const { data: advisor, error: advisorError } = await admin
      .from('profiles')
      .select('id, email, created_at, role')
      .eq('id', advisorId)
      .single();

    if (advisorError || !advisor) {
      return NextResponse.json({ error: 'Advisor not found' }, { status: 404 });
    }

    // Fetch data in parallel
    const [clientsRes, runsRes, exportsRes, loginsRes] = await Promise.all([
      admin.from('clients').select('id, name, created_at').eq('user_id', advisorId).order('created_at', { ascending: false }),
      admin.from('calculation_log').select('id, client_id, created_at, strategy').eq('user_id', advisorId).order('created_at', { ascending: false }),
      admin.from('export_log').select('id, client_id, export_type, created_at').eq('user_id', advisorId).order('created_at', { ascending: false }),
      admin.from('login_log').select('id, created_at').eq('user_id', advisorId).order('created_at', { ascending: false }),
    ]);

    const clients = clientsRes.data ?? [];
    const runs = runsRes.data ?? [];
    const exports = exportsRes.data ?? [];
    const logins = loginsRes.data ?? [];

    // Build client-level stats
    const clientMap = new Map(clients.map(c => [c.id, c.name]));
    const clientRunCounts = new Map<string, number>();
    runs.forEach(r => clientRunCounts.set(r.client_id, (clientRunCounts.get(r.client_id) ?? 0) + 1));
    const clientExportCounts = new Map<string, number>();
    exports.forEach(e => clientExportCounts.set(e.client_id, (clientExportCounts.get(e.client_id) ?? 0) + 1));

    // Last activity per client
    const clientLastActivity = new Map<string, string>();
    runs.forEach(r => {
      if (!clientLastActivity.has(r.client_id)) clientLastActivity.set(r.client_id, r.created_at);
    });

    const clientList = clients.map(c => ({
      id: c.id,
      name: c.name,
      createdAt: c.created_at,
      lastActivity: clientLastActivity.get(c.id) ?? c.created_at,
      scenarioRuns: clientRunCounts.get(c.id) ?? 0,
      exports: clientExportCounts.get(c.id) ?? 0,
    }));

    // Build recent activity feed (last 30 items)
    type ActivityItem = { type: string; clientName: string | null; timestamp: string };
    const activity: ActivityItem[] = [];

    runs.slice(0, 20).forEach(r => {
      activity.push({
        type: 'scenario_run',
        clientName: clientMap.get(r.client_id) ?? null,
        timestamp: r.created_at,
      });
    });

    exports.slice(0, 20).forEach(e => {
      activity.push({
        type: 'export',
        clientName: clientMap.get(e.client_id) ?? null,
        timestamp: e.created_at,
      });
    });

    logins.slice(0, 10).forEach(l => {
      activity.push({
        type: 'login',
        clientName: null,
        timestamp: l.created_at,
      });
    });

    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Engagement stats
    const daysSinceSignup = Math.floor((Date.now() - new Date(advisor.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const lastLogin = logins[0]?.created_at ?? null;
    const daysSinceLastActivity = lastLogin
      ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24))
      : daysSinceSignup;
    const weeks = Math.max(1, daysSinceSignup / 7);

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const lastActivity = lastLogin ? new Date(lastLogin) : new Date(advisor.created_at);

    return NextResponse.json({
      advisor: {
        id: advisor.id,
        email: advisor.email,
        createdAt: advisor.created_at,
        status: lastActivity > fourteenDaysAgo ? 'active' : 'inactive',
        stats: {
          clientCount: clients.length,
          scenarioRunCount: runs.length,
          exportCount: exports.length,
          totalLogins: logins.length,
          avgLoginsPerWeek: Math.round((logins.length / weeks) * 10) / 10,
          daysSinceSignup,
          daysSinceLastActivity,
        },
      },
      clients: clientList,
      recentActivity: activity.slice(0, 30),
    });
  } catch (error) {
    console.error('Admin advisor detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch advisor' }, { status: 500 });
  }
}
