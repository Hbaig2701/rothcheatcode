'use client';

import { useState } from 'react';
import { AlertCircle, CreditCard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaymentFailedBannerProps {
  subscriptionStatus: string | null;
  isTeamMember: boolean;
}

export function PaymentFailedBanner({ subscriptionStatus, isTeamMember }: PaymentFailedBannerProps) {
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Only show for past_due status and non-team members
  if (subscriptionStatus !== 'past_due' || isTeamMember || dismissed) {
    return null;
  }

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        alert(data.error || 'Failed to open billing portal');
      }
    } catch {
      alert('Failed to open billing portal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative bg-[rgba(245,158,11,0.1)] border-b border-[rgba(245,158,11,0.3)]">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <AlertCircle className="h-5 w-5 text-[#f59e0b] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Payment Failed
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Your recent payment failed. Please update your payment method to restore access.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={handleManageSubscription}
              disabled={loading}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-white"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {loading ? 'Loading...' : 'Update Payment'}
            </Button>

            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded hover:bg-secondary text-text-dim hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
