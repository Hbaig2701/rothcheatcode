"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, User, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  currentUrl: string | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  shape: "circle" | "rectangle";
  label: string;
  hint?: string;
  isUploading: boolean;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function ImageUpload({
  currentUrl,
  onUpload,
  onRemove,
  shape,
  label,
  hint,
  isUploading,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Please upload a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_SIZE) {
      alert("File must be under 2MB.");
      return;
    }

    onUpload(file);
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  };

  const PlaceholderIcon = shape === "circle" ? User : ImageIcon;

  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden border-2 border-dashed border-muted-foreground/30 bg-muted/30",
          shape === "circle" ? "size-20 rounded-full" : "h-16 w-48 rounded-lg"
        )}
      >
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={label}
            className="h-full w-full object-contain"
          />
        ) : (
          <PlaceholderIcon className="size-8 text-muted-foreground/50" />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {isUploading ? "Uploading..." : currentUrl ? "Change" : "Upload"}
        </Button>
        {currentUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={isUploading}
          >
            <X className="size-4" />
            Remove
          </Button>
        )}
        {hint && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}
