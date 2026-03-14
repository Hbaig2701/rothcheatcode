import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
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

    const { advisorId, plan = 'standard', cycle = 'monthly' } = await request.json();

    if (!advisorId) {
      return NextResponse.json({ error: 'Advisor ID required' }, { status: 400 });
    }

    // Get advisor email
    const { data: advisor } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', advisorId)
      .single();

    if (!advisor) {
      return NextResponse.json({ error: 'Advisor not found' }, { status: 404 });
    }

    // Use existing checkout flow - just generate the URL
    const origin = request.headers.get('origin') || 'https://retirementexpert.ai';
    const checkoutUrl = `${origin}/api/checkout?plan=${plan}&cycle=${cycle}&email=${encodeURIComponent(advisor.email)}`;

    return NextResponse.json({
      url: checkoutUrl,
      message: 'Checkout link generated successfully',
    });
  } catch (error) {
    console.error('Checkout link generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate checkout link';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
