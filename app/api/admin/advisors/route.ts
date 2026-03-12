import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') ?? 'all';
    const search = searchParams.get('search') ?? '';

    // Fetch all advisor profiles
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, email, created_at, role, is_active, plan, subscription_status')
      .eq('role', 'advisor')
      .order('created_at', { ascending: false });

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ advisors: [], total: 0 });
    }

    const advisorIds = profiles.map(p => p.id);

    // Fetch counts and names in parallel
    const [clientsRes, runsRes, exportsRes, loginsRes, settingsRes] = await Promise.all([
      admin.from('clients').select('user_id').in('user_id', advisorIds),
      admin.from('projections').select('user_id').in('user_id', advisorIds),
      admin.from('export_log').select('user_id').in('user_id', advisorIds),
      admin.from('login_log').select('user_id, created_at').in('user_id', advisorIds).order('created_at', { ascending: false }),
      admin.from('user_settings').select('user_id, first_name, last_name').in('user_id', advisorIds),
    ]);

    // Build count maps
    const clientCounts = new Map<string, number>();
    (clientsRes.data ?? []).forEach(r => clientCounts.set(r.user_id, (clientCounts.get(r.user_id) ?? 0) + 1));

    const runCounts = new Map<string, number>();
    (runsRes.data ?? []).forEach(r => runCounts.set(r.user_id, (runCounts.get(r.user_id) ?? 0) + 1));

    const exportCounts = new Map<string, number>();
    (exportsRes.data ?? []).forEach(r => exportCounts.set(r.user_id, (exportCounts.get(r.user_id) ?? 0) + 1));

    // Names
    const nameMap = new Map<string, string>();
    (settingsRes.data ?? []).forEach(r => {
      const parts = [r.first_name, r.last_name].filter(Boolean);
      if (parts.length > 0) nameMap.set(r.user_id, parts.join(' '));
    });

    // Last login and session count per user
    const lastLogins = new Map<string, string>();
    const sessionCounts = new Map<string, number>();
    (loginsRes.data ?? []).forEach(r => {
      if (!lastLogins.has(r.user_id)) lastLogins.set(r.user_id, r.created_at);
      sessionCounts.set(r.user_id, (sessionCounts.get(r.user_id) ?? 0) + 1);
    });

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const advisors = profiles.map(p => {
      const lastLogin = lastLogins.get(p.id) ?? null;
      const lastActivity = lastLogin ? new Date(lastLogin) : new Date(p.created_at);
      const isRecentlyActive = lastActivity > fourteenDaysAgo;
      const isDeactivated = p.is_active === false;

      return {
        id: p.id,
        name: nameMap.get(p.id) ?? null,
        email: p.email,
        createdAt: p.created_at,
        clientCount: clientCounts.get(p.id) ?? 0,
        scenarioRunCount: runCounts.get(p.id) ?? 0,
        exportCount: exportCounts.get(p.id) ?? 0,
        sessionCount: sessionCounts.get(p.id) ?? 0,
        lastLogin,
        status: isDeactivated ? 'deactivated' as const : (isRecentlyActive ? 'active' as const : 'inactive' as const),
        plan: p.plan ?? 'none',
        subscriptionStatus: p.subscription_status ?? null,
      };
    });

    // Apply filters
    let filtered = advisors;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(a => a.email.toLowerCase().includes(q) || (a.name && a.name.toLowerCase().includes(q)));
    }

    return NextResponse.json({ advisors: filtered, total: filtered.length });
  } catch (error) {
    console.error('Admin advisors error:', error);
    return NextResponse.json({ error: 'Failed to fetch advisors' }, { status: 500 });
  }
}
