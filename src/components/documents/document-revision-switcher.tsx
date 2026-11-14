"use client";

import Link from "next/link";
import { Check, ChevronDown, History, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/core/format";

export type DocumentRevisionItem = {
  id: string;
  documentNumber: string;
  revisionNumber: number;
  isLatestRevision: boolean;
  documentStatus: string;
  totalMinor: number;
  currencyCode: string;
  documentDate: string;
};

export function DocumentRevisionSwitcher({
  currentId,
  baseHref,
  revisions,
}: {
  currentId: string;
  baseHref: string;
  revisions: DocumentRevisionItem[];
}) {
  const current = revisions.find((r) => r.id === currentId);
  const currentRevNum = current?.revisionNumber ?? 0;

  if (revisions.length <= 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Layers className="size-3" />
        Rev {currentRevNum}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring">
        <History className="size-3.5 text-primary" />
        <span>Rev {currentRevNum}</span>
        {current?.isLatestRevision ? (
          <span className="rounded bg-primary/10 px-1 py-0.2 text-[10px] font-semibold text-primary">
            Latest
          </span>
        ) : null}
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-1.5">
        <DropdownMenuLabel className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Revision History</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {revisions.length} {revisions.length === 1 ? "version" : "versions"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {revisions.map((rev) => {
            const isSelected = rev.id === currentId;
            return (
              <DropdownMenuItem key={rev.id} asChild>
                <Link
                  href={`${baseHref}/${rev.id}`}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md p-2 text-xs transition-colors ${
                    isSelected
                      ? "bg-surface-muted font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-surface-muted/50 hover:text-foreground"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="tabular font-medium text-foreground">
                        {rev.documentNumber}
                      </span>
                      {rev.isLatestRevision ? (
                        <span className="rounded bg-primary/10 px-1 py-0.2 text-[10px] font-semibold text-primary">
                          Latest
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {rev.documentDate} · {formatMoney(rev.totalMinor, rev.currencyCode)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={rev.documentStatus} />
                    {isSelected && <Check className="size-3.5 text-primary" />}
                  </div>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
