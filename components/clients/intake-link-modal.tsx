"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Link2, Loader2 } from "lucide-react";

interface IntakeLinkModalProps {
  open: boolean;
  onClose: () => void;
}

export function IntakeLinkModal({ open, onClose }: IntakeLinkModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intake", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setUrl(data.url);
        setExpiresAt(data.expires_at);
      } else {
        setError(data.message || data.error || "Failed to generate link");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      // Reset state after close animation
      setTimeout(() => {
        setUrl(null);
        setExpiresAt(null);
        setError(null);
        setCopied(false);
      }, 200);
    }
  };

  // Generate link on open
  const handleOpen = () => {
    if (open && !url && !loading) {
      generateLink();
    }
  };

  // Trigger generation when modal opens
  if (open && !url && !loading && !error) {
    handleOpen();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Client Questionnaire Link
          </DialogTitle>
          <DialogDescription>
            Share this link with your client. They&apos;ll fill out their basic information and it will automatically appear in your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red/20 bg-red-bg p-4">
              <p className="text-sm text-red">{error}</p>
            </div>
          )}

          {url && (
            <>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={url}
                  className="text-sm font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  onClick={copyToClipboard}
                  variant="outline"
                  className="shrink-0 gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-green" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              {expiresAt && (
                <p className="text-xs text-muted-foreground">
                  This link expires on{" "}
                  {new Date(expiresAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  . Generate a new one if it expires.
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
