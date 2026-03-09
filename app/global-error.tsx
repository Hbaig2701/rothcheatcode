"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0a0a0a]">
        <div className="flex min-h-screen flex-col items-center justify-center">
          <div className="text-center space-y-6">
            <h1 className="text-4xl font-bold text-white">Something went wrong</h1>
            <p className="text-[rgba(255,255,255,0.6)] max-w-md">
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-white text-black rounded-md font-medium hover:bg-gray-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
