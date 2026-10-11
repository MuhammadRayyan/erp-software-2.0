"use client";

import { useState } from "react";
import { Lock, Unlock, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/form-error";
import { updateFinancialLockDateAction } from "../actions";

export function FinancialLockForm({
  businessId,
  currentLockDate,
}: {
  businessId: string;
  currentLockDate: string | null;
}) {
  const router = useRouter();
  const [lockDate, setLockDate] = useState<string>(currentLockDate ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>("");

  async function handleSave(newDate: string | null) {
    setPending(true);
    setError("");
    const res = await updateFinancialLockDateAction(businessId, newDate);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    toast.success(newDate ? `Financial period closed through ${newDate}.` : "Financial lock date cleared.");
    router.refresh();
  }

  const isLocked = Boolean(currentLockDate);

  return (
    <div className="space-y-6">
      <div className="data-panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex size-11 items-center justify-center rounded-lg ${isLocked ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary"}`}>
              {isLocked ? <Lock className="size-5" /> : <Unlock className="size-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Ledger Lock Status</h2>
                <Badge tone={isLocked ? "warning" : "neutral"}>
                  {isLocked ? `Locked through ${currentLockDate}` : "Open (No Lock Date)"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Prevents accidental additions or modifications to finalized accounting periods.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <div className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lock-date">Financial Lock Date</Label>
              <Input
                id="lock-date"
                type="date"
                value={lockDate}
                onChange={(e) => setLockDate(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Any transactions dated on or prior to this date cannot be created, posted, updated, or voided.
              </p>
            </div>

            {error && <FormError message={error} />}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={() => handleSave(lockDate || null)}
                disabled={pending || !lockDate}
              >
                <Lock className="size-4" /> Apply Lock Date
              </Button>

              {isLocked && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLockDate("");
                    handleSave(null);
                  }}
                  disabled={pending}
                >
                  <Unlock className="size-4" /> Remove Lock Date
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-muted/30 p-4 text-xs text-muted-foreground space-y-2">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck className="size-4 text-primary" /> Accounting Audit Best Practices
        </div>
        <p>
          In accordance with standard GAAP / IFRS accounting controls, set a lock date at the end of each closed fiscal month or annual audit period.
          This ensures historical financial statements, tax filings, and general ledger reports remain frozen and verifiable.
        </p>
      </div>
    </div>
  );
}
