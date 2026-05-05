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
      <SheetContent className="sm:max-w-2xl w-full flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle>Edit Product</SheetTitle>
          <SheetDescription>
            Update parameters. Changes apply to new client illustrations going forward.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
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
