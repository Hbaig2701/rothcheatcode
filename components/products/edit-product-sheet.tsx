"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCustomProduct } from "@/lib/queries/products";
import { ManualBuilder } from "./manual-builder";
import { Loader2 } from "lucide-react";

interface EditProductSheetProps {
  productId: string | null;
  onClose: () => void;
}

export function EditProductSheet({ productId, onClose }: EditProductSheetProps) {
  const { data, isLoading } = useCustomProduct(productId);
  const open = !!productId;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="data-[side=right]:sm:max-w-[820px] w-full flex flex-col p-0 gap-0 bg-background"
      >
        <SheetHeader className="px-7 py-5 border-b border-border-default shrink-0 space-y-1">
          <SheetTitle className="text-base font-medium">Edit Product</SheetTitle>
          <SheetDescription className="text-xs text-foreground/55">
            Update parameters. Changes apply to new client illustrations going forward.
          </SheetDescription>
        </SheetHeader>

        <div
          className="
            flex-1 overflow-y-auto px-7 py-5
            [&_input:not([type=radio]):not([type=checkbox])]:!bg-white
            [&_input:not([type=radio]):not([type=checkbox])]:!border
            [&_input:not([type=radio]):not([type=checkbox])]:!border-slate-300
            [&_input:not([type=radio]):not([type=checkbox])]:!h-10
            [&_input:not([type=radio]):not([type=checkbox])]:!text-sm
            [&_input:not([type=radio]):not([type=checkbox])]:!font-medium
            [&_input:not([type=radio]):not([type=checkbox])]:!text-foreground
            [&_input:not([type=radio]):not([type=checkbox])]:!rounded-lg
            [&_input:not([type=radio]):not([type=checkbox])]:!px-3.5
            [&_input:not([type=radio]):not([type=checkbox])]:!shadow-sm
            [&_input:not([type=radio]):not([type=checkbox])]:transition-colors
            [&_input:hover]:!bg-slate-50 [&_input:hover]:!border-slate-400
            [&_input:focus]:!bg-white [&_input:focus]:!border-gold [&_input:focus]:!ring-1 [&_input:focus]:!ring-gold/30
            dark:[&_input:not([type=radio]):not([type=checkbox])]:!bg-white/[0.08]
            dark:[&_input:not([type=radio]):not([type=checkbox])]:!border-white/[0.18]
            dark:[&_input:not([type=radio]):not([type=checkbox])]:!shadow-none
            dark:[&_input:hover]:!bg-white/[0.10] dark:[&_input:hover]:!border-white/[0.24]
            dark:[&_input:focus]:!bg-white/[0.10]
            [&_[data-slot=select-trigger]]:!bg-white
            [&_[data-slot=select-trigger]]:!border
            [&_[data-slot=select-trigger]]:!border-slate-300
            [&_[data-slot=select-trigger]]:!h-10
            [&_[data-slot=select-trigger]]:!text-sm
            [&_[data-slot=select-trigger]]:!font-medium
            [&_[data-slot=select-trigger]]:!text-foreground
            [&_[data-slot=select-trigger]]:!w-full
            [&_[data-slot=select-trigger]]:!rounded-lg
            [&_[data-slot=select-trigger]]:!shadow-sm
            [&_[data-slot=select-trigger]]:transition-colors
            [&_[data-slot=select-trigger]:hover]:!bg-slate-50
            [&_[data-slot=select-trigger]:hover]:!border-slate-400
            dark:[&_[data-slot=select-trigger]]:!bg-white/[0.08]
            dark:[&_[data-slot=select-trigger]]:!border-white/[0.18]
            dark:[&_[data-slot=select-trigger]]:!shadow-none
            dark:[&_[data-slot=select-trigger]:hover]:!bg-white/[0.10]
            dark:[&_[data-slot=select-trigger]:hover]:!border-white/[0.24]
          "
        >
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {data && (
            <ManualBuilder
              productId={data.id}
              initialCategory={data.category}
              initialName={data.name}
              initialArchetype={data.archetype}
              initialConfig={data.config}
              initialCarrier={data.carrier_name}
              initialCarrierProduct={data.carrier_product_name}
              initialFlags={data.modifier_flags}
              initialSource={data.source}
              initialAISources={data.ai_research_sources}
              initialAIWarnings={data.ai_warnings}
              initialUnsupported={data.ai_unsupported_features}
              onSaved={() => onClose()}
              onCancel={onClose}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
