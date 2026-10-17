"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, ExternalLink, Plus, RotateCcw, Search, Sparkles, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/core/format";
import {
  applyBankRuleAction,
  ignoreStatementLineAction,
  matchStatementLineAction,
  resetStatementLineAction,
} from "./actions";
import { getSourceHref, type MatchCandidate } from "./matching-types";

export function StatementLineActions({
  businessId,
  accountId,
  lineId,
  status,
  currency,
  candidates,
  amountMinor,
  transactionDate,
  reference,
  description,
  matchedRule,
}: {
  businessId: string;
  accountId: string;
  lineId: string;
  status: "unmatched" | "matched" | "created" | "ignored";
  currency: string;
  candidates: MatchCandidate[];
  amountMinor?: number;
  transactionDate?: string;
  reference?: string | null;
  description?: string;
  matchedRule?: { id: string; name: string } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ error?: string }>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (status !== "unmatched") {
    return (
      <div>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || status === "created"}
          onClick={() => run(() => resetStatementLineAction(businessId, accountId, lineId))}
        >
          <RotateCcw className="size-3.5" /> {status === "created" ? "Linked transaction" : "Reset"}
        </Button>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const isMoneyIn = typeof amountMinor === "number" && amountMinor > 0;
  const isMoneyOut = typeof amountMinor === "number" && amountMinor < 0;
  const formattedAmount = typeof amountMinor === "number" ? (Math.abs(amountMinor) / 100).toFixed(2) : "";
  const receiptHref = `/b/${businessId}/sales/receipts/new?bankAccountId=${accountId}&amount=${formattedAmount}&date=${transactionDate ?? ""}&reference=${encodeURIComponent(reference ?? "")}&description=${encodeURIComponent(description ?? "")}`;
  const paymentHref = `/b/${businessId}/purchases/payments/new?bankAccountId=${accountId}&amount=${formattedAmount}&date=${transactionDate ?? ""}&reference=${encodeURIComponent(reference ?? "")}&description=${encodeURIComponent(description ?? "")}`;

  return (
    <div className="min-w-[360px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {matchedRule && (
          <Button
            size="sm"
            disabled={pending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs font-medium"
            title={`Auto-categorize with rule: ${matchedRule.name}`}
            onClick={() =>
              run(() => applyBankRuleAction(businessId, accountId, matchedRule.id, lineId))
            }
          >
            <Wand2 className="size-3.5 mr-1" /> Apply Rule: {matchedRule.name}
          </Button>
        )}

        {candidates[0] && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() =>
                matchStatementLineAction(
                  businessId,
                  accountId,
                  lineId,
                  candidates[0].sourceType,
                  candidates[0].sourceId,
                ),
              )
            }
          >
            <Check className="size-3.5" /> Match {candidates[0].sourceNumber}
          </Button>
        )}

        {isMoneyIn && (
          <Button asChild variant="secondary" size="sm" title="Record customer receipt for this deposit">
            <Link href={receiptHref}>
              <Plus className="size-3.5" /> Record Receipt
            </Link>
          </Button>
        )}

        {isMoneyOut && (
          <Button asChild variant="secondary" size="sm" title="Record supplier payment for this withdrawal">
            <Link href={paymentHref}>
              <Plus className="size-3.5" /> Record Payment
            </Link>
          </Button>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
        >
          <Search className="size-3.5" /> Find Other{candidates.length ? ` (${candidates.length})` : ""}
        </Button>

        <Button asChild variant="ghost" size="sm" title="Create non-AR/AP bank transaction">
          <Link
            href={`/b/${businessId}/banking/transactions/new?accountId=${accountId}&statementLineId=${lineId}`}
          >
            <Plus className="size-3.5" /> Bank Transaction
          </Link>
        </Button>

        <Button asChild variant="ghost" size="sm" title="Create a bank rule from this statement line">
          <Link
            href={`/b/${businessId}/settings/bank-rules?create=1&matchText=${encodeURIComponent(description || "")}&direction=${isMoneyIn ? "money_in" : "money_out"}&bankAccountId=${accountId}`}
          >
            <Sparkles className="size-3.5 mr-1 text-primary" /> Rule
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => ignoreStatementLineAction(businessId, accountId, lineId))}
        >
          <X className="size-3.5" /> Ignore
        </Button>
      </div>

      {expanded && (
        <div className="mt-2 rounded-md border border-border bg-surface p-2">
          {candidates.length ? (
            candidates.map((candidate) => (
              <div
                key={`${candidate.sourceType}-${candidate.sourceId}`}
                className="flex items-center gap-3 border-b border-border px-1 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{candidate.sourceNumber}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(candidate.date)}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {candidate.party || candidate.description || candidate.sourceType} ·{" "}
                    {formatMoney(Math.abs(candidate.amountMinor), currency)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      matchStatementLineAction(
                        businessId,
                        accountId,
                        lineId,
                        candidate.sourceType,
                        candidate.sourceId,
                      ),
                    )
                  }
                >
                  Match
                </Button>
                <Link
                  aria-label={`Open ${candidate.sourceNumber}`}
                  href={getSourceHref(businessId, candidate.sourceType, candidate.sourceId) ?? "#"}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </Link>
              </div>
            ))
          ) : (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              No exact unmatched transaction was found. Create a Bank Transaction or review source documents.
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
