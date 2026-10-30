"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="text-sm text-muted">The page hit an unexpected error. Details were not shown to protect sensitive data.</p>
      <Button variant="outline" onClick={reset}>Try again</Button>
    </main>
  );
}
