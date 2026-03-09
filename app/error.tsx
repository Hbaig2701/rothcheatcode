"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center space-y-6">
        <img src="/logo.png" alt="Retirement Expert" className="h-10 w-auto mx-auto" />
        <h1 className="text-4xl font-bold text-white">Something went wrong</h1>
        <p className="text-[rgba(255,255,255,0.6)] max-w-md">
          An unexpected error occurred. Please try again or contact support if the issue persists.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>Try Again</Button>
          <a href="/dashboard">
            <Button variant="outline">Go to Dashboard</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
