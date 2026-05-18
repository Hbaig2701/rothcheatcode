"use client";

import { useRef, useEffect, useState, KeyboardEvent, ClipboardEvent, ChangeEvent } from "react";
import { Send, Loader2, Paperclip, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { prepareAttachment, type PreparedAttachment } from "@/lib/chat/attachments";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  // Receives the typed message + any attached data URLs.
  onSubmit: (message: string, attachments: string[]) => void;
  disabled?: boolean;
  busy?: boolean;
}

export function ChatInput({ value, onChange, onSubmit, disabled, busy }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    setAttachmentError(null);
    const next: PreparedAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const prepared = await prepareAttachment(file);
        next.push(prepared);
      } catch (err) {
        setAttachmentError(err instanceof Error ? err.message : "Failed to attach image");
      }
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    // Catch clipboard images (Cmd/Ctrl+V from a screenshot). Files take
    // precedence over text — if both are present we still let the text
    // paste through normally.
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    void addFiles(e.target.files);
    // Clear so re-picking the same file still fires onChange.
    e.target.value = "";
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled || busy) return;
    onSubmit(trimmed, attachments.map((a) => a.dataUrl));
    setAttachments([]);
    setAttachmentError(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled && !busy;

  return (
    <div className="border-t border-border-default/60 bg-surface">
      {(attachments.length > 0 || attachmentError) && (
        <div className="px-3 pt-3 space-y-2">
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="relative group rounded-lg border border-border-default overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="size-16 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    aria-label="Remove attachment"
                    className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachmentError && (
            <p className="text-xs text-red-500">{attachmentError}</p>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilePick}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach image"
          disabled={disabled || busy}
          className={cn(
            "shrink-0 size-9 rounded-full flex items-center justify-center transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-bg-input",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
          title="Attach a screenshot"
        >
          <Paperclip className="size-4" />
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask anything, or paste a screenshot…"
          rows={1}
          disabled={disabled}
          className={cn(
            "flex-1 resize-none bg-bg-input border border-border-default rounded-xl px-3 py-2 text-sm",
            "text-foreground placeholder:text-muted-foreground/60",
            "focus:outline-none focus:ring-1 focus:ring-gold focus:border-gold/40",
            "transition-colors max-h-[140px]",
          )}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            "shrink-0 size-9 rounded-full flex items-center justify-center transition-colors",
            "bg-gold text-primary-foreground hover:bg-[rgba(212,175,55,0.9)]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
    </div>
  );
}

// Re-export the icon for parity with other UI primitives the chat folder
// uses. Some message thread variants render an empty-state icon when no
// images have been attached yet.
export { ImageIcon as ChatImageIcon };
