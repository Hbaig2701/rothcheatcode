import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { getStripePriceId } from '@/lib/config/plans';

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

    // Get the price ID from environment variables
    const priceId = getStripePriceId(
      plan as 'standard' | 'starter' | 'pro',
      cycle as 'monthly' | 'annual'
    );
    const origin = request.headers.get('origin') || 'https://retirementexpert.ai';

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: advisor.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard`,
      allow_promotion_codes: true, // Allow discount codes
      billing_address_collection: 'required',
      metadata: {
        user_id: advisorId, // Webhook expects 'user_id' for reliable profile linking
        plan, // Ensures plan is set immediately on checkout completion
        cycle, // Ensures billing_cycle is set immediately
        generated_by: 'admin',
      },
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Checkout link generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate checkout link' },
      { status: 500 }
    );
  }
}
