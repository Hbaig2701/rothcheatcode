'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Crown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaymentWallModalProps {
  enabled: boolean; // Master switch - set to true on Sunday to activate
}

export function PaymentWallModal({ enabled }: PaymentWallModalProps) {
  const [shouldBlock, setShouldBlock] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // If feature is disabled, don't block anyone
    if (!enabled) {
      setLoading(false);
      return;
    }

    const checkAccess = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        // Get user's profile and subscription info
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, stripe_customer_id, stripe_subscription_id, email')
          .eq('id', user.id)
          .single();

        if (!profile) {
          setLoading(false);
          return;
        }

        // Don't block admins
        if (profile.role === 'admin') {
          setLoading(false);
          return;
        }

        // Don't block if they have actual Stripe subscription
        const hasStripeSubscription = profile.stripe_customer_id || profile.stripe_subscription_id;
        if (hasStripeSubscription) {
          setLoading(false);
          return;
        }

        // Block this user - they're on free/grandfathered access
        setShouldBlock(true);

        // Generate their personalized checkout link
        const origin = window.location.origin;
        const checkoutLink = `${origin}/api/checkout?plan=standard&cycle=monthly&email=${encodeURIComponent(profile.email || '')}`;
        setCheckoutUrl(checkoutLink);

        setLoading(false);
      } catch (error) {
        console.error('Payment wall check failed:', error);
        setLoading(false);
      }
    };

    checkAccess();
  }, [enabled]);

  const handleSubscribeClick = () => {
    if (checkoutUrl) {
      setRedirecting(true);
      window.location.href = checkoutUrl;
    }
  };

  // Don't render anything if:
  // - Feature is disabled
  // - Still loading
  // - User should not be blocked
  if (!enabled || loading || !shouldBlock) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm">
      <div className="max-w-md mx-4">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-[rgba(212,175,55,0.15)] flex items-center justify-center">
            <Crown className="w-10 h-10 text-[#d4af37]" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white text-center mb-3">
          Your Trial Has Ended
        </h1>

        {/* Message */}
        <p className="text-[rgba(255,255,255,0.65)] text-center mb-8 leading-relaxed">
          Subscribe now to regain access to Retirement Expert and continue creating
          powerful retirement projections for your clients.
        </p>

        {/* Subscribe Button */}
        <Button
          onClick={handleSubscribeClick}
          disabled={redirecting}
          className="w-full h-12 bg-[#d4af37] hover:bg-[#c5a028] text-black font-semibold text-base transition-colors"
        >
          {redirecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Redirecting to checkout...
            </>
          ) : (
            'Subscribe Now'
          )}
        </Button>

        {/* Additional info */}
        <p className="text-xs text-[rgba(255,255,255,0.45)] text-center mt-6">
          Questions? Contact{' '}
          <a href="mailto:support@retirementexpert.ai" className="text-[#d4af37] hover:underline">
            support@retirementexpert.ai
          </a>
        </p>
      </div>
    </div>
  );
}
