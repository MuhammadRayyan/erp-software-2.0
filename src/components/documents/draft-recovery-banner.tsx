"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DraftRecoveryBanner({
  hasDraft,
  savedAt,
  onRestore,
  onDiscard,
}: {
  hasDraft: boolean;
  savedAt: number | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  if (!hasDraft) return null;

  const formattedTime = savedAt
    ? new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "earlier";

  return (
    <div
      role="status"
      className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/8 px-3.5 py-2.5 text-sm"
    >
      <div className="flex items-center gap-2 text-foreground">
        <History className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>Unsaved draft recovered from {formattedTime}.</span>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onRestore}>
          Restore draft
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
