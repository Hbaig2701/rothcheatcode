"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload, Wrench, ArrowLeft, Loader2, FileText, AlertCircle, Users } from "lucide-react";
import { useResearchProduct } from "@/lib/queries/products";
import { ManualBuilder } from "./manual-builder";
import { ResearchResults, type ResearchResult } from "./research-results";
import { CommunityProductsBrowser } from "./community-products-dialog";
import type { CustomProductRow } from "@/lib/products/types";

// AI web-search ("search by product name") path is hidden in the UI for now —
// only PDF upload + manual builder are exposed. The /api/products/research
// endpoint still supports method: "search" so we can re-enable the UI once
// the search-result quality is improved. To restore: add "search" back to
// the Step union, re-introduce SearchStep, and wire onSearch through
// EntryStep — see git history for the prior implementation.
type Step = "entry" | "community" | "upload" | "manual" | "researching" | "results";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProductDialog({ open, onOpenChange }: AddProductDialogProps) {
  const [step, setStep] = useState<Step>("entry");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const research = useResearchProduct();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("entry");
    setUploadedFile(null);
    setResearchResult(null);
    setError(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const handleUpload = async () => {
    if (!uploadedFile) return;
    if (uploadedFile.size > 10 * 1024 * 1024) {
      setError("File too large (max 10MB)");
      return;
    }
    setStep("researching");
    setError(null);
    try {
      const base64 = await fileToBase64(uploadedFile);
      const r = await research.mutateAsync({
        method: "document",
        document: { base64, name: uploadedFile.name },
      });
      handleResearchResponse(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document analysis failed");
      setStep("upload");
    }
  };

  const handleResearchResponse = (r: Awaited<ReturnType<typeof research.mutateAsync>>) => {
    try {
      if (!r.product_found || !r.archetype || !r.parameters) {
        setError(r.error || "Could not extract product details from this document. Try a clearer brochure or use the manual builder.");
        setStep("upload");
        return;
      }
      setResearchResult({
        product_found: true,
        category: (r.category ?? (r.archetype.startsWith("growth-") ? "growth" : "income")) as "growth" | "income",
        archetype: r.archetype as ResearchResult["archetype"],
        carrier: r.carrier ?? null,
        carrier_product_name: r.carrier_product_name ?? null,
        suggested_generic_name: r.suggested_generic_name ?? "Custom Product",
        config: r.parameters as unknown as ResearchResult["config"],
        modifier_flags: Array.isArray(r.modifier_flags) ? r.modifier_flags : [],
        sources: Array.isArray(r.sources)
          ? r.sources
              .filter((s): s is { url: string; type: string } => !!s && typeof s.url === "string")
              .map((s) => ({
                url: s.url,
                type: (s.type === "official" || s.type === "third_party" || s.type === "uploaded_document") ? s.type : "third_party",
              }))
          : [],
        warnings: Array.isArray(r.warnings)
          ? r.warnings
              .filter((w): w is { field: string; message: string; resolution: string } => !!w && typeof w.message === "string")
              .map((w) => ({
                field: w.field ?? "",
                message: w.message,
                resolution: (w.resolution === "assumed" || w.resolution === "not_found" || w.resolution === "ambiguous") ? w.resolution : "assumed",
              }))
          : [],
        unsupported_features: Array.isArray(r.unsupported_features)
          ? r.unsupported_features
              .filter((f): f is { feature: string; description: string; approach: string; impact: string } => !!f && typeof f.feature === "string")
              .map((f) => ({
                feature: f.feature,
                description: f.description ?? "",
                approach: f.approach ?? "",
                impact: (f.impact === "low" || f.impact === "medium" || f.impact === "high") ? f.impact : "low",
              }))
          : [],
        source: uploadedFile ? "ai_document" : "ai_research",
      });
      setStep("results");
    } catch (e) {
      console.error("[handleResearchResponse]", e, r);
      setError(`Failed to parse AI response: ${e instanceof Error ? e.message : "unknown error"}. Try the manual builder.`);
      setStep("upload");
    }
  };

  const handleSaved = (_product: CustomProductRow) => {
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            {step !== "entry" && step !== "researching" && step !== "results" && (
              <Button variant="ghost" size="icon-sm" onClick={() => setStep("entry")} aria-label="Back">
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {step === "entry" && "Add a Product"}
            {step === "community" && (
              <span className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                Community Products
              </span>
            )}
            {step === "upload" && "Upload Document"}
            {step === "manual" && "Manual Builder"}
            {step === "researching" && "Analyzing..."}
            {step === "results" && "Product Found"}
          </DialogTitle>
          {step === "entry" && (
            <DialogDescription>
              Add one from the Community catalog, upload a brochure for AI to extract, or build it manually.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === "community" && <CommunityProductsBrowser />}

        <div className={`flex-1 overflow-y-auto px-6 py-5 ${step === "community" ? "hidden" : ""}`}>
          {step === "entry" && (
            <EntryStep
              onCommunity={() => setStep("community")}
              onUpload={() => setStep("upload")}
              onManual={() => setStep("manual")}
            />
          )}

          {step === "upload" && (
            <UploadStep
              file={uploadedFile}
              onFile={setUploadedFile}
              onSubmit={handleUpload}
              error={error}
              inputRef={fileInputRef}
            />
          )}

          {step === "manual" && (
            <ManualBuilder
              onSaved={handleSaved}
              onCancel={() => setStep("entry")}
            />
          )}

          {step === "researching" && <ResearchingStep />}

          {step === "results" && researchResult && (
            <ResearchResults
              result={researchResult}
              onSaved={handleSaved}
              onCancel={handleClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryStep({
  onCommunity,
  onUpload,
  onManual,
}: {
  onCommunity: () => void;
  onUpload: () => void;
  onManual: () => void;
}) {
  return (
    <div className="space-y-3 pt-2">
      {/* PRIMARY: Community Products — zero setup, add an existing product in one click */}
      <button
        onClick={onCommunity}
        className="w-full flex items-start gap-4 rounded-lg border-2 border-primary/40 bg-primary/5 p-5 text-left hover:bg-primary/10 hover:border-primary/60 transition-all relative"
      >
        <div className="absolute -top-2 left-4 px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-semibold uppercase rounded">
          Recommended
        </div>
        <div className="size-12 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Users className="size-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-base">Choose from Community Products</div>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a ready-made product from the shared catalog and add it to your
            list in one click. No setup — it becomes your own editable copy.
          </p>
        </div>
      </button>

      {/* SECONDARY: PDF upload — most accurate path when the product isn't in the catalog */}
      <button
        onClick={onUpload}
        className="w-full flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent/40 hover:border-foreground/30 transition-all"
      >
        <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Upload className="size-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-medium flex items-center gap-2">
            Upload a brochure or spec sheet
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase font-semibold">AI</span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            PDF from your carrier wholesaler. AI extracts every parameter from the official document.
          </p>
        </div>
      </button>

      {/* SECONDARY: Manual builder */}
      <button
        onClick={onManual}
        className="w-full flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent/40 hover:border-foreground/30 transition-all"
      >
        <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Wrench className="size-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-medium">Manual builder</div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter parameters yourself if you already know the product specs.
          </p>
        </div>
      </button>
    </div>
  );
}

function UploadStep({
  file,
  onFile,
  onSubmit,
  error,
  inputRef,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  onSubmit: () => void;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
        {file ? (
          <div className="space-y-2">
            <FileText className="size-10 mx-auto text-primary" />
            <div className="font-medium">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              Choose different file
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Upload className="size-10 mx-auto text-muted-foreground" />
            <div>
              <Button onClick={() => inputRef.current?.click()}>Browse Files</Button>
            </div>
            <p className="text-xs text-muted-foreground">PDF · Max 10MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-300/40 bg-red-50/30 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={!file}>
          <Sparkles className="size-4" />
          Analyze Document
        </Button>
      </div>
    </div>
  );
}

const RESEARCH_STAGES = [
  "Reading the document...",
  "Identifying the product...",
  "Extracting bonus and surrender details...",
  "Checking state variations...",
  "Mapping to calculation engine...",
];

function ResearchingStep() {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStageIdx((i) => (i + 1) % RESEARCH_STAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="py-8 space-y-4">
      <div className="flex items-center justify-center">
        <div className="relative">
          <Loader2 className="size-12 animate-spin text-primary" />
          <Sparkles className="absolute inset-0 m-auto size-5 text-primary" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="font-medium">{RESEARCH_STAGES[stageIdx]}</p>
        <p className="text-sm text-muted-foreground">
          This usually takes 15-30 seconds.
        </p>
      </div>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:application/pdf;base64, prefix
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
