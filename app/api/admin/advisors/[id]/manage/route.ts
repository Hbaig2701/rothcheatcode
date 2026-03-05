import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
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

    // Prevent admin from managing themselves
    if (advisorId === user.id) {
      return NextResponse.json({ error: 'Cannot manage your own account' }, { status: 400 });
    }

    const admin = createAdminClient();
    const body = await request.json();
    const { action } = body;

    // Verify advisor exists
    const { data: advisor, error: advisorError } = await admin
      .from('profiles')
      .select('id, email, is_active')
      .eq('id', advisorId)
      .single();

    if (advisorError || !advisor) {
      return NextResponse.json({ error: 'Advisor not found' }, { status: 404 });
    }

    switch (action) {
      case 'deactivate': {
        const { error } = await admin
          .from('profiles')
          .update({ is_active: false, deactivated_at: new Date().toISOString() })
          .eq('id', advisorId);
        if (error) throw error;
        return NextResponse.json({ success: true, message: 'Account deactivated' });
      }

      case 'reactivate': {
        const { error } = await admin
          .from('profiles')
          .update({ is_active: true, deactivated_at: null })
          .eq('id', advisorId);
        if (error) throw error;
        return NextResponse.json({ success: true, message: 'Account reactivated' });
      }

      case 'reset_password': {
        // Generate a password reset link and send it to the user's email
        const { error } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email: advisor.email,
        });
        if (error) throw error;
        return NextResponse.json({ success: true, message: 'Password reset email sent' });
      }

      case 'delete': {
        // Delete all user data in order (respecting foreign keys)
        // 1. Delete projections (references clients)
        await admin.from('projections').delete().eq('user_id', advisorId);
        // 2. Delete export_log (references clients)
        await admin.from('export_log').delete().eq('user_id', advisorId);
        // 3. Delete calculation_log
        await admin.from('calculation_log').delete().eq('user_id', advisorId);
        // 4. Delete login_log
        await admin.from('login_log').delete().eq('user_id', advisorId);
        // 5. Delete clients
        await admin.from('clients').delete().eq('user_id', advisorId);
        // 6. Delete user_settings
        await admin.from('user_settings').delete().eq('user_id', advisorId);
        // 7. Delete profile
        await admin.from('profiles').delete().eq('id', advisorId);
        // 8. Delete auth user
        const { error } = await admin.auth.admin.deleteUser(advisorId);
        if (error) throw error;
        return NextResponse.json({ success: true, message: 'User permanently deleted' });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin manage error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
