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
import { Check, Copy, Link2, Loader2, Globe, User } from "lucide-react";

interface IntakeLinkModalProps {
  open: boolean;
  onClose: () => void;
}

type LinkMode = "single" | "permanent";

export function IntakeLinkModal({ open, onClose }: IntakeLinkModalProps) {
  const [mode, setMode] = useState<LinkMode>("single");
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isPermanent, setIsPermanent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Tracks whether the user has actively chosen a mode this session so the
  // auto-generate effect doesn't re-fire and overwrite their pick.
  const [hasGenerated, setHasGenerated] = useState(false);

  const generateLink = async (forMode: LinkMode) => {
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permanent: forMode === "permanent" }),
      });
      const data = await res.json();
      if (res.ok) {
        setUrl(data.url);
        setExpiresAt(data.expires_at);
        setIsPermanent(data.is_permanent === true);
        setHasGenerated(true);
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
        setMode("single");
        setUrl(null);
        setExpiresAt(null);
        setIsPermanent(false);
        setError(null);
        setCopied(false);
        setHasGenerated(false);
      }, 200);
    }
  };

  const handleModeChange = (newMode: LinkMode) => {
    if (newMode === mode && hasGenerated) return;
    setMode(newMode);
    void generateLink(newMode);
  };

  // Auto-generate the default single-use link on first open so the common
  // case stays one-click. Mode switches re-generate against the API.
  if (open && !url && !loading && !error && !hasGenerated) {
    void generateLink(mode);
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

        {/* Mode selector — single-use vs permanent. Single-use is the
            historical default for one-off invites; permanent is for
            advisors pasting the link on a public website. */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleModeChange("single")}
            className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
              mode === "single"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-accent/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">For one client</span>
            </div>
            <span className="text-xs text-muted-foreground leading-snug">
              One-time link, expires in 7 days. Email it to a specific client.
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("permanent")}
            className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
              mode === "permanent"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-accent/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">For my website</span>
            </div>
            <span className="text-xs text-muted-foreground leading-snug">
              Reusable forever. Anyone who submits becomes a new client.
            </span>
          </button>
        </div>

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

          {url && !loading && (
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

              {isPermanent ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Permanent link — paste it on your website, in your email signature, or anywhere else.
                  Every submission creates a new client under your account.
                  Each submission still counts toward your client limit.
                </p>
              ) : expiresAt ? (
                <p className="text-xs text-muted-foreground">
                  This link expires on{" "}
                  {new Date(expiresAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  . Generate a new one if it expires.
                </p>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
