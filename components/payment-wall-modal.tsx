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
  const [monthlyUrl, setMonthlyUrl] = useState<string | null>(null);
  const [annualUrl, setAnnualUrl] = useState<string | null>(null);
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

        // Generate their personalized checkout links (both monthly and annual)
        const origin = window.location.origin;
        const email = encodeURIComponent(profile.email || '');
        const monthlyLink = `${origin}/api/checkout?plan=standard&cycle=monthly&email=${email}`;
        const annualLink = `${origin}/api/checkout?plan=standard&cycle=annual&email=${email}`;

        setMonthlyUrl(monthlyLink);
        setAnnualUrl(annualLink);

        setLoading(false);
      } catch (error) {
        console.error('Payment wall check failed:', error);
        setLoading(false);
      }
    };

    checkAccess();
  }, [enabled]);

  const handleSubscribeClick = (url: string) => {
    if (url) {
      // Open in new tab instead of redirecting current tab
      window.open(url, '_blank', 'noopener,noreferrer');
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

        {/* Subscription Options */}
        <div className="space-y-3 mb-6">
          {/* Monthly Option */}
          <Button
            onClick={() => handleSubscribeClick(monthlyUrl || '')}
            disabled={redirecting || !monthlyUrl}
            className="w-full h-14 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.16)] hover:shadow-lg hover:shadow-white/10 border-2 border-[rgba(255,255,255,0.25)] hover:border-[rgba(255,255,255,0.4)] text-white font-semibold transition-all duration-200 flex flex-col items-center justify-center shadow-md cursor-pointer"
          >
            {redirecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
              </>
            ) : (
              <>
                <span className="text-lg">Monthly</span>
                <span className="text-sm text-[rgba(255,255,255,0.65)] font-normal">$197/month</span>
              </>
            )}
          </Button>

          {/* Annual Option */}
          <Button
            onClick={() => handleSubscribeClick(annualUrl || '')}
            disabled={redirecting || !annualUrl}
            className="w-full h-14 bg-[#d4af37] hover:bg-[#e5c047] hover:shadow-xl hover:shadow-[#d4af37]/30 border-2 border-[#d4af37] hover:border-[#e5c047] text-black font-semibold transition-all duration-200 flex flex-col items-center justify-center relative shadow-lg cursor-pointer"
          >
            {redirecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
              </>
            ) : (
              <>
                <span className="absolute top-1 right-2 text-[10px] bg-black/20 px-2 py-0.5 rounded-full">
                  Save $394
                </span>
                <span className="text-lg">Annual</span>
                <span className="text-sm text-black/70 font-normal">$1,970/year</span>
              </>
            )}
          </Button>
        </div>

        {/* Small text below buttons */}
        <p className="text-xs text-[rgba(255,255,255,0.45)] text-center mb-6">
          Cancel anytime • No long-term contracts
        </p>

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
