import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
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

    const admin = createAdminClient();

    // Get all advisor profiles
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, created_at, plan, subscription_status, billing_cycle')
      .eq('role', 'advisor')
      .order('created_at', { ascending: false });

    if (!profiles) {
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }

    // Get client counts for each advisor
    const advisorIds = profiles.map(p => p.id);
    const { data: clientCounts } = await admin
      .from('clients')
      .select('user_id');

    const clientCountMap = new Map<string, number>();
    (clientCounts || []).forEach(c => {
      clientCountMap.set(c.user_id, (clientCountMap.get(c.user_id) || 0) + 1);
    });

    // Categorize users
    const freeUsers = profiles
      .filter(p => {
        // Would be blocked: not active/trialing AND no paid plan
        const notPaying = p.subscription_status !== 'active' && p.subscription_status !== 'trialing';
        const noPlan = !p.plan || p.plan === 'none';
        return notPaying || noPlan;
      })
      .map(p => ({
        id: p.id,
        email: p.email,
        signupDate: p.created_at,
        plan: p.plan || 'none',
        subscriptionStatus: p.subscription_status || 'none',
        billingCycle: p.billing_cycle,
        clientCount: clientCountMap.get(p.id) || 0,
        daysSinceSignup: Math.floor((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      }));

    const payingUsers = profiles
      .filter(p => {
        const isPaying = p.subscription_status === 'active' || p.subscription_status === 'trialing';
        const hasPlan = p.plan && p.plan !== 'none';
        return isPaying && hasPlan;
      })
      .map(p => ({
        id: p.id,
        email: p.email,
        plan: p.plan,
        subscriptionStatus: p.subscription_status,
        billingCycle: p.billing_cycle,
        clientCount: clientCountMap.get(p.id) || 0,
      }));

    // Active users (have created at least 1 client)
    const activeBlockedUsers = freeUsers.filter(u => u.clientCount > 0);
    const inactiveBlockedUsers = freeUsers.filter(u => u.clientCount === 0);

    return NextResponse.json({
      summary: {
        totalAdvisors: profiles.length,
        payingUsers: payingUsers.length,
        freeUsers: freeUsers.length,
        activeBlockedUsers: activeBlockedUsers.length,
        inactiveBlockedUsers: inactiveBlockedUsers.length,
      },
      freeUsers: {
        active: activeBlockedUsers,
        inactive: inactiveBlockedUsers,
      },
      payingUsers,
    });
  } catch (error) {
    console.error('Free users API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch free users' },
      { status: 500 }
    );
  }
}
