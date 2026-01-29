"use client";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export function ClientsEmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-muted p-3 mb-4">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No clients yet</h3>
        <p className="text-muted-foreground text-center mb-4 max-w-sm">
          Get started by adding your first client to begin planning their Roth conversions.
        </p>
        <a href="/clients/new" className={buttonVariants()}>
          Add your first client
        </a>
      </CardContent>
    </Card>
  );
}
