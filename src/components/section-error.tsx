"use client";
import { Button } from "@/components/ui/button";

export function SectionError({ label, error, reset }: { label: string; error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <h3 className="text-lg font-semibold">Failed to load {label}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
      <Button variant="secondary" className="mt-4" onClick={() => reset()}>Try again</Button>
    </div>
  );
}
