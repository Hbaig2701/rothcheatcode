"use client";

import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface FieldHelpProps {
  title?: string;
  body: string;
  example?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Small question-mark icon next to a field label. On hover/focus, opens a
 * popup with a plain-language explanation of what the field means and an
 * example. Used heavily across the manual client form and the intake
 * questionnaire because advisors were frequently mis-filling fields.
 */
export function FieldHelp({ title, body, example, side = "right" }: FieldHelpProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="What is this?"
            tabIndex={0}
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-help"
          />
        }
      >
        <HelpCircle className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent
        className="max-w-xs p-3.5 text-left bg-popover border border-gold-border text-foreground shadow-lg"
        side={side}
      >
        {title && (
          <div className="text-xs font-semibold text-gold mb-1.5 leading-tight">
            {title}
          </div>
        )}
        <p className="text-xs text-text-dim leading-relaxed whitespace-pre-line">
          {body}
        </p>
        {example && (
          <div className="mt-2 pt-2 border-t border-border/60 text-xs text-text-dim leading-relaxed">
            <span className="font-semibold text-foreground">Example: </span>
            <span className="whitespace-pre-line">{example}</span>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
