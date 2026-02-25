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
    const type = searchParams.get('type') ?? 'scenario_runs';
    const range = searchParams.get('range') ?? '30d';

    // Calculate start date
    const now = new Date();
    let startDate: Date;
    switch (range) {
      case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case '90d': startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
    }

    const tableName = type === 'exports' ? 'export_log' : type === 'logins' ? 'login_log' : 'calculation_log';

    const { data: rows, error: queryError } = await admin
      .from(tableName)
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (queryError) throw queryError;

    // Group by date
    const dateCounts = new Map<string, number>();
    (rows ?? []).forEach(row => {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
    });

    // Fill in missing dates with 0
    const data: { date: string; count: number }[] = [];
    const current = new Date(startDate);
    while (current <= now) {
      const dateStr = current.toISOString().split('T')[0];
      data.push({ date: dateStr, count: dateCounts.get(dateStr) ?? 0 });
      current.setDate(current.getDate() + 1);
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Admin activity error:', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}
