"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Rocket } from "lucide-react";

export function BillingTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>
          Manage your subscription and payment methods
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 py-12">
          <Rocket className="size-10 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">Coming Soon</h3>
          <p className="text-sm text-muted-foreground">
            Billing management will be available in a future update.
          </p>
          <p className="text-sm text-muted-foreground">
            Current Plan: <strong>Beta Access</strong>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
