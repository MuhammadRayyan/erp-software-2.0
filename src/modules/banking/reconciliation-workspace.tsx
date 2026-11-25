"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Check, ExternalLink, LoaderCircle, Plus, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { useActionPermission } from "@/components/permissions-provider";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, minorToDecimalString } from "@/core/format";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { ignoreStatementLineAction, matchStatementLineToManyAction, resetStatementLineAction } from "./actions";
import { getSourceHref, type MatchCandidate, type MatchSourceRef } from "./matching-types";

export type WorkspaceStatementLine = {
  id: string;
  transactionDate: string;
  description: string;
  reference: string | null;
  amountMinor: number;
};

export type WorkspaceClearedLine = WorkspaceStatementLine & {
  entries: { sourceType: string; sourceId: string; entryNumber: string; journalEntryId: string }[];
};

const movementKey = (movement: MatchSourceRef) => `${movement.sourceType}:${movement.sourceId}`;

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function matches(query: string, ...values: (string | null | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return !needle || values.some((value) => value?.toLowerCase().includes(needle));
}

/**
 * Two-pane matching: pick a statement line on the left, tick one or more book
 * entries on the right until the remaining difference is zero, then match.
 */
export function ReconciliationWorkspace({
  businessId,
  accountId,
  currency,
  statementLines,
  movements,
  cleared,
}: {
  businessId: string;
  accountId: string;
  currency: string;
  statementLines: WorkspaceStatementLine[];
  movements: MatchCandidate[];
  cleared: WorkspaceClearedLine[];
}) {
  const router = useRouter();
  const canEdit = useActionPermission("edit");
  const [pending, startTransition] = useTransition();
  const [selectedLineId, setSelectedLineId] = useState<string | null>(statementLines[0]?.id ?? null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [lineQuery, setLineQuery] = useState("");
  const [bookQuery, setBookQuery] = useState("");
  const [sameDirectionOnly, setSameDirectionOnly] = useState(true);

  const visibleLines = useMemo(
    () => statementLines.filter((line) => matches(lineQuery, line.description, line.reference, minorToDecimalString(Math.abs(line.amountMinor), currency))),
    [statementLines, lineQuery, currency],
  );
  const selectedLine = statementLines.find((line) => line.id === selectedLineId) ?? null;

  const rankedMovements = useMemo(() => {
    const filtered = movements.filter((movement) => {
      if (selectedLine && sameDirectionOnly && Math.sign(movement.amountMinor) !== Math.sign(selectedLine.amountMinor)) return false;
      return matches(bookQuery, movement.sourceNumber, movement.party, movement.description, movement.reference,
        minorToDecimalString(Math.abs(movement.amountMinor), currency));
    });
    if (!selectedLine) return filtered;
    const reference = selectedLine.reference?.trim().toLowerCase();
    // Exact amount first, then entries small enough to be part of a split
    // match, then reference match, then nearest date.
    const score = (movement: MatchCandidate) =>
      (movement.amountMinor === selectedLine.amountMinor ? 0 : 1) * 10_000
      + (Math.abs(movement.amountMinor) <= Math.abs(selectedLine.amountMinor) ? 0 : 1) * 1_000
      + (reference && movement.reference?.trim().toLowerCase() === reference ? 0 : 1) * 100
      + Math.min(daysBetween(movement.date, selectedLine.transactionDate), 99);
    return [...filtered].sort((a, b) => score(a) - score(b));
  }, [movements, selectedLine, sameDirectionOnly, bookQuery, currency]);

  const pickedMovements = movements.filter((movement) => picked.has(movementKey(movement)));
  const pickedTotal = pickedMovements.reduce((sum, movement) => sum + movement.amountMinor, 0);
  const remaining = selectedLine ? selectedLine.amountMinor - pickedTotal : 0;
  const canMatch = Boolean(selectedLine) && pickedMovements.length > 0 && remaining === 0;

  function selectLine(id: string) {
    setSelectedLineId(id);
    setPicked(new Set());
  }

  function togglePicked(movement: MatchCandidate) {
    setPicked((current) => {
      const next = new Set(current);
      const key = movementKey(movement);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function moveSelection(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = visibleLines.findIndex((line) => line.id === selectedLineId);
    const next = visibleLines[Math.min(visibleLines.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      selectLine(next.id);
      document.getElementById(`statement-line-${next.id}`)?.focus();
    }
  }

  function run(action: () => Promise<{ error?: string }>, success: string, advance = false) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      if (advance && selectedLine) {
        const index = statementLines.findIndex((line) => line.id === selectedLine.id);
        const next = statementLines[index + 1] ?? statementLines[index - 1];
        setSelectedLineId(next && next.id !== selectedLine.id ? next.id : null);
      }
      setPicked(new Set());
      router.refresh();
    });
  }

  const match = () => {
    if (!selectedLine || !canMatch) return;
    const sources = pickedMovements.map(({ sourceType, sourceId }) => ({ sourceType, sourceId }));
    run(() => matchStatementLineToManyAction(businessId, accountId, selectedLine.id, sources),
      sources.length === 1 ? "Statement line matched" : `Statement line matched to ${sources.length} entries`, true);
  };

  const money = (minor: number) => formatMoney(minor, currency);
  const amountTone = (minor: number) => (minor > 0 ? "text-success" : "text-foreground");
  const isMoneyIn = (selectedLine?.amountMinor ?? 0) > 0;
  const lineAmountInput = selectedLine ? minorToDecimalString(Math.abs(selectedLine.amountMinor), currency) : "";
  const prefill = selectedLine
    ? `bankAccountId=${accountId}&amount=${lineAmountInput}&date=${selectedLine.transactionDate}&reference=${encodeURIComponent(selectedLine.reference ?? "")}&description=${encodeURIComponent(selectedLine.description)}`
    : "";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Statement pane */}
        <section aria-labelledby="statement-pane-title" className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-surface-raised">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 id="statement-pane-title" className="text-sm font-semibold">Bank statement</h2>
              <p className="text-xs text-muted-foreground">{statementLines.length} unmatched {statementLines.length === 1 ? "line" : "lines"}</p>
            </div>
            <label className="relative w-44">
              <span className="sr-only">Search statement lines</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={lineQuery} onChange={(event) => setLineQuery(event.target.value)} placeholder="Search" className="h-8 pl-8 text-xs" />
            </label>
          </header>
          {visibleLines.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon={<Check className="size-5" />} title={statementLines.length ? "No lines match your search" : "Every statement line is matched"} description={statementLines.length ? "Clear the search to see all lines." : "Import a newer statement or complete the reconciliation."} />
            </div>
          ) : (
            <div role="listbox" aria-label="Unmatched statement lines" className="max-h-[60vh] flex-1 overflow-y-auto" onKeyDown={moveSelection}>
              {visibleLines.map((line) => {
                const selected = line.id === selectedLineId;
                return (
                  <div
                    key={line.id}
                    id={`statement-line-${line.id}`}
                    role="option"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectLine(line.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectLine(line.id); } }}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 border-b border-l-[3px] border-b-border border-l-transparent px-4 py-2.5 outline-none last:border-b-0 hover:bg-surface-muted focus-visible:bg-surface-muted",
                      selected && "border-l-primary bg-accent hover:bg-accent focus-visible:bg-accent",
                    )}
                  >
                    {line.amountMinor > 0
                      ? <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-success" aria-label="Money in" />
                      : <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Money out" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(line.transactionDate)}{line.reference ? ` · ${line.reference}` : ""}
                      </p>
                    </div>
                    <span className={cn("money shrink-0 text-sm font-semibold", amountTone(line.amountMinor))}>{money(line.amountMinor)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Book pane */}
        <section aria-labelledby="book-pane-title" className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-surface-raised">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 id="book-pane-title" className="text-sm font-semibold">Book entries</h2>
              <p className="text-xs text-muted-foreground">
                {selectedLine ? "Tick the entries that make up the selected statement line." : "Select a statement line to match."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={sameDirectionOnly} onCheckedChange={(value) => setSameDirectionOnly(value === true)} aria-label="Same direction only" />
                Same direction
              </label>
              <label className="relative w-40">
                <span className="sr-only">Search book entries</span>
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={bookQuery} onChange={(event) => setBookQuery(event.target.value)} placeholder="Search" className="h-8 pl-8 text-xs" />
              </label>
            </div>
          </header>
          {!selectedLine ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Select a statement line on the left.</div>
          ) : (
            <>
              <div className="max-h-[52vh] flex-1 overflow-y-auto">
                {rankedMovements.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No unmatched book entries{bookQuery ? " match your search" : ""}. Record the transaction below.
                  </p>
                ) : rankedMovements.map((movement) => {
                  const key = movementKey(movement);
                  const checked = picked.has(key);
                  const exact = movement.amountMinor === selectedLine.amountMinor;
                  const href = getSourceHref(businessId, movement.sourceType, movement.sourceId);
                  return (
                    <label
                      key={key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-muted",
                        checked && "bg-accent hover:bg-accent",
                      )}
                    >
                      <Checkbox className="mt-0.5" checked={checked} disabled={!canEdit} onCheckedChange={() => togglePicked(movement)}
                        aria-label={`Select ${movement.sourceNumber}`} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          {movement.sourceNumber}
                          {exact ? <span className="rounded-sm bg-success/12 px-1.5 py-px text-[11px] font-medium text-success">Exact amount</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {journalSourceLabel(movement.sourceType)} · {formatDate(movement.date)}
                          {movement.party ? ` · ${movement.party}` : ""}{movement.reference ? ` · ${movement.reference}` : ""}
                        </p>
                      </div>
                      <span className={cn("money shrink-0 text-sm font-semibold", amountTone(movement.amountMinor))}>{money(movement.amountMinor)}</span>
                      {href ? (
                        <Link href={href} target="_blank" aria-label={`Open ${movement.sourceNumber} in a new tab`} className="mt-0.5 text-muted-foreground hover:text-foreground" onClick={(event) => event.stopPropagation()}>
                          <ExternalLink className="size-3.5" />
                        </Link>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <footer className="space-y-3 border-t border-border bg-surface px-4 py-3">
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-muted-foreground">Statement line</dt><dd className="money mt-0.5 text-sm font-semibold">{money(selectedLine.amountMinor)}</dd></div>
                  <div><dt className="text-muted-foreground">Selected ({pickedMovements.length})</dt><dd className="money mt-0.5 text-sm font-semibold">{money(pickedTotal)}</dd></div>
                  <div>
                    <dt className="text-muted-foreground">Remaining</dt>
                    <dd className={cn("money mt-0.5 text-sm font-semibold", remaining === 0 && pickedMovements.length ? "text-success" : "text-warning")} aria-live="polite">{money(remaining)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {isMoneyIn ? (
                      <Button permission="create" permissionModule="sales" asChild size="sm" variant="secondary">
                        <Link href={`/b/${businessId}/sales/receipts/new?${prefill}`}><Plus className="size-3.5" /> Receipt</Link>
                      </Button>
                    ) : (
                      <Button permission="create" permissionModule="purchases" asChild size="sm" variant="secondary">
                        <Link href={`/b/${businessId}/purchases/payments/new?${prefill}`}><Plus className="size-3.5" /> Payment</Link>
                      </Button>
                    )}
                    <Button permission="create" asChild size="sm" variant="secondary">
                      <Link href={`/b/${businessId}/banking/transactions/new?accountId=${accountId}&statementLineId=${selectedLine.id}`}><Plus className="size-3.5" /> Bank transaction</Link>
                    </Button>
                    <Button permission="edit" size="sm" variant="ghost" disabled={pending}
                      onClick={() => run(() => ignoreStatementLineAction(businessId, accountId, selectedLine.id), "Statement line ignored", true)}>
                      <X className="size-3.5" /> Ignore
                    </Button>
                  </div>
                  <Button permission="edit" size="sm" disabled={!canMatch || pending} onClick={match}>
                    {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    Match{pickedMovements.length > 1 ? ` ${pickedMovements.length} entries` : ""}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Matched / cleared</h2>
          <span className="text-xs text-muted-foreground">{cleared.length} statement {cleared.length === 1 ? "line" : "lines"}</span>
        </div>
        {cleared.length ? (
          <div className="data-panel overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead><tr><th>Date</th><th>Statement line</th><th>Matched to</th><th className="text-right!">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {cleared.map((line) => (
                  <tr key={line.id}>
                    <td>{formatDate(line.transactionDate)}</td>
                    <td>{line.description}</td>
                    <td>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {line.entries.map((entry) => {
                          const href = getSourceHref(businessId, entry.sourceType, entry.sourceId);
                          return href
                            ? <Link key={entry.journalEntryId} href={href} className="text-primary hover:underline">{journalSourceLabel(entry.sourceType)} · {entry.entryNumber}</Link>
                            : <span key={entry.journalEntryId}>{journalSourceLabel(entry.sourceType)} · {entry.entryNumber}</span>;
                        })}
                      </div>
                    </td>
                    <td className="money text-right">{money(line.amountMinor)}</td>
                    <td className="text-right">
                      <Button permission="edit" size="sm" variant="ghost" disabled={pending}
                        onClick={() => run(() => resetStatementLineAction(businessId, accountId, line.id), "Match removed")}>
                        <RotateCcw className="size-3.5" /> Unmatch
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-surface px-4 py-5 text-sm text-muted-foreground">No matched statement lines through this date.</div>
        )}
      </section>
    </div>
  );
}

