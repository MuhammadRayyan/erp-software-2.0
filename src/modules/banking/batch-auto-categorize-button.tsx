"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { batchApplyBankRulesAction } from "./actions";

export function BatchAutoCategorizeButton({
  businessId,
  accountId,
  matchesCount,
}: {
  businessId: string;
  accountId: string;
  matchesCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  if (matchesCount === 0) return null;

  function handleBatchApply() {
    setError("");
    startTransition(async () => {
      const res = await batchApplyBankRulesAction(businessId, accountId);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5 shadow-2xs">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">
            {matchesCount} unmatched statement {matchesCount === 1 ? "line matches" : "lines match"} your Bank Rules
          </p>
          <p className="text-[11px] text-muted-foreground">
            Auto-categorize and generate GL postings with 1 click using your saved rules.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-danger">{error}</span>}
        <Button
          size="sm"
          disabled={pending}
          onClick={handleBatchApply}
          className="shadow-xs"
        >
          <Wand2 className="size-3.5 mr-1" />
          {pending ? "Categorizing..." : `Auto-Categorize All (${matchesCount})`}
        </Button>
      </div>
    </div>
  );
}
