"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <TooltipPrimitive.Provider delay={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger
          className="inline-flex items-center justify-center p-0.5 bg-transparent border-none cursor-help text-[#6b7280] hover:text-[#14b8a6] focus:text-[#14b8a6] focus:outline-none transition-colors duration-150"
          aria-label="More information"
          type="button"
        >
          <Info size={13} />
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            side="top"
            sideOffset={8}
            align="center"
            className="isolate z-[1000]"
          >
            <TooltipPrimitive.Popup
              role="tooltip"
              className="data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=top]:slide-in-from-bottom-2 data-[side=bottom]:slide-in-from-top-2 origin-(--transform-origin) bg-[#1a2332] border border-[#3d4f6f] rounded-lg px-4 py-3 max-w-[300px] min-w-[200px] text-white text-[13px] leading-relaxed text-left shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
            >
              {text}
              <TooltipPrimitive.Arrow className="size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-[#1a2332] fill-[#1a2332] z-50 data-[side=top]:-bottom-2.5 data-[side=bottom]:top-1" />
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
