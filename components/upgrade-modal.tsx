"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, Check, Loader2 } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
  current?: number;
  limit?: number;
}

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  current,
  limit,
}: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/upgrade");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-gold" />
            Upgrade to Pro
          </DialogTitle>
          {feature && limit !== undefined && current !== undefined && (
            <DialogDescription>
              You&apos;ve reached your limit of {limit} {feature} on the Starter
              plan ({current}/{limit} used).
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">
            Upgrade to Pro for:
          </p>
          <ul className="space-y-1.5">
            {[
              "Unlimited clients",
              "Unlimited scenario runs",
              "Unlimited PDF exports",
              "White-label reports",
              "Unlimited team members",
              "Priority support",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-sm text-white"
              >
                <Check className="size-4 text-gold" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} disabled={loading}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Upgrade to Pro — $297/mo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
