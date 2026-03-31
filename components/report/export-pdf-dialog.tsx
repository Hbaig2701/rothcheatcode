"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/settings/color-picker";
import { Loader2, Lock, Zap, Upload, ImageIcon, X } from "lucide-react";
import type { Client } from "@/lib/types/client";
import type { Projection } from "@/lib/types/projection";
import { hasFullAccess, type PlanId } from "@/lib/config/plans";

interface ExportPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  projection: Projection;
}

interface BrandingForm {
  companyName: string;
  tagline: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  phone: string;
  email: string;
  website: string;
}

const DEFAULT_BRANDING: BrandingForm = {
  companyName: "",
  tagline: "",
  logoUrl: "",
  primaryColor: "#1a3a5c",
  secondaryColor: "#14b8a6",
  phone: "",
  email: "",
  website: "",
};

export function ExportPdfDialog({
  open,
  onOpenChange,
  client,
  projection,
}: ExportPdfDialogProps) {
  const [plan, setPlan] = useState<string | null>(null);
  const [savedBranding, setSavedBranding] = useState<BrandingForm>(DEFAULT_BRANDING);
  const [form, setForm] = useState<BrandingForm>(DEFAULT_BRANDING);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPro = plan ? hasFullAccess(plan as PlanId) : false;

  // Fetch settings and plan on open
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/billing/plan").then((r) => r.json()),
    ])
      .then(([settings, planData]) => {
        const branding: BrandingForm = {
          companyName: settings.company_name || "",
          tagline: settings.tagline || "",
          logoUrl: settings.logo_url || "",
          primaryColor: settings.primary_color || "#1a3a5c",
          secondaryColor: settings.secondary_color || "#14b8a6",
          phone: settings.company_phone || "",
          email: settings.company_email || "",
          website: settings.company_website || "",
        };
        setSavedBranding(branding);
        setForm(branding);
        setPlan(planData.plan || "none");
      })
      .catch(() => {
        setPlan("none");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/settings/logo", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setForm((prev) => ({ ...prev, logoUrl: data.url }));
    } catch (err) {
      console.error("Logo upload error:", err);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await fetch("/api/settings/logo", { method: "DELETE" });
      setForm((prev) => ({ ...prev, logoUrl: "" }));
    } catch (err) {
      console.error("Logo remove error:", err);
    }
  };

  const handleExport = async () => {
    setGenerating(true);
    setError(null);

    try {
      // Build overrides only if pro and form differs from saved
      let brandingOverrides: Record<string, string> | undefined;
      if (isPro) {
        const changed: Record<string, string> = {};
        for (const key of Object.keys(form) as (keyof BrandingForm)[]) {
          if (form[key] !== savedBranding[key]) {
            changed[key] = form[key];
          }
        }
        if (Object.keys(changed).length > 0) {
          brandingOverrides = changed;
        }
      }

      const response = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportData: { client, projection },
          brandingOverrides,
          title: title.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 403 && errorData.showUpgrade) {
          setError(`Export limit reached (${errorData.current}/${errorData.limit}). Upgrade to continue.`);
          return;
        }
        throw new Error(errorData.error || "Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const sanitizedName = (client.name || "Client")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "_");
      const timestamp = new Date().toISOString().split("T")[0];
      link.download = `RetirementExpert_${sanitizedName}_${timestamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Save branding to settings for next time
      if (isPro) {
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: form.companyName,
            tagline: form.tagline,
            primary_color: form.primaryColor,
            secondary_color: form.secondaryColor,
            company_phone: form.phone,
            company_email: form.email,
            company_website: form.website,
          }),
        }).catch(console.error);
      }

      setTitle(""); // Clear title after successful export
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF generation failed";
      setError(message);
    } finally {
      setGenerating(false);
    }
  };

  const updateField = (key: keyof BrandingForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Report</DialogTitle>
          <DialogDescription>
            Customize your report branding before exporting.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="relative">
            {/* Report Title - Available to all users */}
            <div className="mb-6 space-y-1.5">
              <label className="text-sm font-medium">
                Report Title <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Initial Consultation, Q1 2026 Review, Final Proposal"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !generating) {
                    handleExport();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Helps identify this report in your history
              </p>
            </div>

            {/* Starter overlay */}
            {!isPro && (
              <div className="mb-4 rounded-lg border border-border-default bg-bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Report customization is available on the Premium plan
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Upgrade to add your company branding, logo, and colors to exported reports.
                </p>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/billing/upgrade");
                      const data = await res.json();
                      if (data.url) window.open(data.url, "_blank");
                    } catch { /* ignore */ }
                  }}
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Upgrade to Premium
                </Button>
              </div>
            )}

            <fieldset disabled={!isPro} className={!isPro ? "opacity-50 pointer-events-none" : ""}>
              <div className="space-y-4">
                {/* Company Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Company Name</label>
                  <Input
                    value={form.companyName}
                    onChange={(e) => updateField("companyName", e.target.value)}
                    placeholder="Your Company Name"
                  />
                </div>

                {/* Tagline */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tagline</label>
                  <Input
                    value={form.tagline}
                    onChange={(e) => updateField("tagline", e.target.value)}
                    placeholder="Your tagline or slogan"
                  />
                </div>

                {/* Logo */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Logo</label>
                  <div className="flex items-center gap-3">
                    {form.logoUrl ? (
                      <div className="relative h-12 w-24 rounded border border-border-default bg-bg-card flex items-center justify-center overflow-hidden">
                        <img
                          src={form.logoUrl}
                          alt="Logo"
                          className="max-h-10 max-w-20 object-contain"
                        />
                        <button
                          type="button"
                          onClick={handleRemoveLogo}
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-foreground flex items-center justify-center"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-12 w-24 rounded border border-dashed border-border flex items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {uploading ? "Uploading..." : "Upload Logo"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        Saved to your account
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </div>
                </div>

                {/* Colors */}
                <div className="grid grid-cols-2 gap-4">
                  <ColorPicker
                    label="Primary Color"
                    value={form.primaryColor}
                    onChange={(v) => updateField("primaryColor", v)}
                  />
                  <ColorPicker
                    label="Secondary Color"
                    value={form.secondaryColor}
                    onChange={(v) => updateField("secondaryColor", v)}
                  />
                </div>

                {/* Contact */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Contact Information</label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      value={form.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="Phone"
                    />
                    <Input
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="Email"
                    />
                  </div>
                  <Input
                    value={form.website}
                    onChange={(e) => updateField("website", e.target.value)}
                    placeholder="Website"
                  />
                </div>
              </div>
            </fieldset>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={generating || loading}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Export Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
