"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetBusinessPreferences } from "@/modules/preferences/actions";

/**
 * Card with a destructive "Reset to defaults" affordance. Invokes the
 * `resetBusinessPreferences` server action which wipes every preference
 * key for this user+business, then triggers a revalidation so the page
 * reflects the empty state. The button stays disabled while the action
 * is in flight to prevent double-clicks.
 */
export function PreferencesResetCard({ businessId, count }: { businessId: string; count: number }) {
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  const handleReset = () => {
    startTransition(async () => {
      const result = await resetBusinessPreferences(businessId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Cleared ${result.deleted} preference key(s).`);
      setConfirmed(false);
    });
  };

  return (
    <section aria-label="Reset display preferences" className="mt-4 rounded-lg border border-border bg-surface-raised p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-medium">Reset to defaults</h2>
            <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">
              Clears every column-visibility toggle and KPI card toggle stored for this account on this business. Your data (invoices, customers, etc.) is not affected. {count > 0 ? `${count} key${count === 1 ? "" : "s"} will be removed.` : "No preferences are currently stored."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {confirmed ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmed(false)} disabled={isPending}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleReset} disabled={isPending}>
                <RotateCcw className="size-4" /> {isPending ? "Resetting…" : "Confirm reset"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setConfirmed(true)} disabled={count === 0 || isPending}>
              <RotateCcw className="size-4" /> Reset
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
