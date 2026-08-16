"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page-container">
      <div className="max-w-xl rounded-lg border border-danger/25 bg-surface-raised p-6">
        <AlertTriangle className="size-6 text-danger" />
        <h1 className="mt-4 text-lg font-semibold">Settings section error</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Something went wrong loading this settings page. Your data was not changed.
        </p>
        <Button className="mt-5" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}

