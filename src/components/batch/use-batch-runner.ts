"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import type { BatchActionResult } from "@/modules/shared/batch";

export type BatchNoun = { one: string; many: string };

/**
 * Runs a bulk server action and reports the outcome consistently: one success
 * toast, one error toast listing the documents that failed, then a refresh.
 */
export function useBatchRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<BatchActionResult>,
    { noun, done, verb, onSuccess }: { noun: BatchNoun; done: string; verb: string; onSuccess?: () => void },
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        const label = (count: number) => `${count} ${count === 1 ? noun.one : noun.many}`;
        if (result.successCount > 0) {
          toast.success(`${done} ${label(result.successCount)}.`);
          onSuccess?.();
          broadcastLiveRefresh();
          router.refresh();
        }
        if (result.failedCount > 0) {
          const detail = result.errors.map((error) => (error.number ? `${error.number}: ${error.error}` : error.error)).join("; ");
          toast.error(`Could not ${verb} ${label(result.failedCount)}${detail ? `: ${detail}` : "."}`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not ${verb} the selected ${noun.many}.`);
      }
    });
  }

  return { pending, run };
}
