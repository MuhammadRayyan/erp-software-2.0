"use client";

import { CircleCheck, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BatchActionResult } from "@/modules/shared/batch";
import { useBatchRunner, type BatchNoun } from "./use-batch-runner";

/** Activate / Deactivate buttons for a selection of contacts or similar records. */
export function BatchActiveButtons<T extends { id: string }>({
  selected,
  isActive,
  noun,
  setActive,
  onDone,
}: {
  selected: T[];
  isActive: (row: T) => boolean;
  noun: BatchNoun;
  setActive: (ids: string[], active: boolean) => Promise<BatchActionResult>;
  onDone: () => void;
}) {
  const { pending, run } = useBatchRunner();
  const inactive = selected.filter((row) => !isActive(row));
  const active = selected.filter((row) => isActive(row));
  return (
    <>
      {inactive.length > 0 ? (
        <Button permission="edit" type="button" variant="secondary" size="sm" disabled={pending} className="h-8 gap-1.5 text-xs"
          onClick={() => run(() => setActive(inactive.map((row) => row.id), true), { noun, done: "Activated", verb: "activate", onSuccess: onDone })}>
          <CircleCheck className="size-3.5" /> Activate ({inactive.length})
        </Button>
      ) : null}
      {active.length > 0 ? (
        <Button permission="edit" type="button" variant="secondary" size="sm" disabled={pending} className="h-8 gap-1.5 text-xs"
          onClick={() => run(() => setActive(active.map((row) => row.id), false), { noun, done: "Deactivated", verb: "deactivate", onSuccess: onDone })}>
          <CircleSlash className="size-3.5" /> Deactivate ({active.length})
        </Button>
      ) : null}
    </>
  );
}
