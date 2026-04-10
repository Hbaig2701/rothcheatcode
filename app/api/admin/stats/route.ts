import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Test accounts to exclude from all metrics
const TEST_EMAILS = ['hbkidspare+homework@gmail.com', 'allank94@live.com'];

function getDateRange(range: string, from?: string, to?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);

  switch (range) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case '7d':
      return { start: new Date(now.getTime() - 7 * 86400000), end };
    case '30d':
      return { start: new Date(now.getTime() - 30 * 86400000), end };
    case 'mtd': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
    case 'custom': {
      const start = from ? new Date(from) : new Date(now.getTime() - 30 * 86400000);
      const customEnd = to ? new Date(to) : end;
      return { start, end: customEnd };
    }
    case 'all':
    default:
      return { start: new Date('2020-01-01'), end };
  }
}

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

    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') ?? 'all';
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const { start, end } = getDateRange(range, from, to);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Get test account IDs to exclude
    const { data: testProfiles } = await admin
      .from('profiles')
      .select('id')
      .in('email', TEST_EMAILS);
    const testIds = (testProfiles ?? []).map(p => p.id);

    // Get paying advisor IDs (have Stripe subscription)
    const { data: payingProfiles } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'advisor')
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null);

    const payingIds = (payingProfiles ?? []).map(p => p.id);

    // Count paying advisors who signed up in range
    const payingSignupsInRange = (payingProfiles ?? []).length; // total paying

    // For filtered counts, use date range
    const buildQuery = (table: string) => {
      let q = admin.from(table).select('id', { count: 'exact', head: true })
        .gte('created_at', startIso)
        .lte('created_at', endIso);
      if (testIds.length > 0) {
        q = q.not('user_id', 'in', `(${testIds.join(',')})`);
      }
      // Only count activity from paying users
      if (payingIds.length > 0) {
        q = q.in('user_id', payingIds);
      }
      return q;
    };

    // Count paying advisors signed up in the range
    let advisorQuery = admin.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'advisor')
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    // All-time totals for paying customers
    let totalAdvisorsQuery = admin.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'advisor')
      .not('email', 'in', `(${TEST_EMAILS.join(',')})`)
      .not('stripe_customer_id', 'is', null);

    const [advisorsInRange, totalAdvisors, clients, scenarioRuns, exports] = await Promise.all([
      advisorQuery,
      totalAdvisorsQuery,
      buildQuery('clients'),
      buildQuery('projections'),
      buildQuery('export_log'),
    ]);

    return NextResponse.json({
      totalPayingAdvisors: totalAdvisors.count ?? 0,
      newPayingAdvisors: advisorsInRange.count ?? 0,
      clients: clients.count ?? 0,
      scenarioRuns: scenarioRuns.count ?? 0,
      exports: exports.count ?? 0,
      range,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
