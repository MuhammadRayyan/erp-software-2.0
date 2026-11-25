"use client";

import { useState, type ReactNode } from "react";
import { Ban, CheckCircle2 } from "lucide-react";
import { BatchActionBar } from "@/components/batch-action-bar";
import { BatchConfirmModal } from "@/components/documents/batch-confirm-modal";
import { Button } from "@/components/ui/button";
import { exportCsv, type CsvColumn } from "@/lib/export-csv";
import type { BatchActionResult } from "@/modules/shared/batch";
import { useBatchRunner, type BatchNoun } from "./use-batch-runner";
import { getBusinessTodayIso } from "@/core/format";

type BatchCall = (ids: string[]) => Promise<BatchActionResult>;

/**
 * Selection toolbar for document lists: export the selection, post drafts,
 * void posted documents and delete drafts, each with a confirmation and a
 * per-document error report.
 */
export function BatchDocumentActions<T extends { id: string }>({
  selected,
  totalCount,
  noun,
  statusOf,
  onClear,
  onSelectAll,
  exportConfig,
  post,
  voidAction,
  deleteDrafts,
  children,
}: {
  selected: T[];
  totalCount: number;
  noun: BatchNoun;
  statusOf: (row: T) => string;
  onClear: () => void;
  onSelectAll?: () => void;
  exportConfig?: { filename: string; columns: CsvColumn<T>[] };
  post?: { label: string; action: BatchCall };
  voidAction?: { action: BatchCall; description: string };
  deleteDrafts?: BatchCall;
  children?: ReactNode;
}) {
  const { pending, run } = useBatchRunner();
  const [confirm, setConfirm] = useState<"void" | "delete" | null>(null);
  const drafts = selected.filter((row) => statusOf(row) === "draft");
  const posted = selected.filter((row) => statusOf(row) === "posted");
  const ids = (rows: T[]) => rows.map((row) => row.id);
  const finish = () => {
    setConfirm(null);
    onClear();
  };

  return (
    <>
      <BatchActionBar
        selectedCount={selected.length}
        totalCount={totalCount}
        onClearSelection={onClear}
        onSelectAll={onSelectAll}
        onExportSelected={exportConfig
          ? () => exportCsv(`${exportConfig.filename}-selected-${getBusinessTodayIso()}.csv`,
            exportConfig.columns as CsvColumn<Record<string, unknown>>[], selected as unknown as Record<string, unknown>[])
          : undefined}
        onDeleteSelected={deleteDrafts && drafts.length > 0 ? () => setConfirm("delete") : undefined}
        deleteLabel={`Delete drafts (${drafts.length})`}
        isDeleting={pending}
      >
        {post && drafts.length > 0 ? (
          <Button permission="post" type="button" variant="secondary" size="sm" disabled={pending}
            className="h-8 gap-1.5 text-xs"
            onClick={() => run(() => post.action(ids(drafts)), { noun, done: "Posted", verb: "post", onSuccess: onClear })}>
            <CheckCircle2 className="size-3.5" /> {post.label} ({drafts.length})
          </Button>
        ) : null}
        {voidAction && posted.length > 0 ? (
          <Button permission="delete" type="button" variant="secondary" size="sm" disabled={pending}
            className="h-8 gap-1.5 text-xs text-danger hover:bg-danger/10" onClick={() => setConfirm("void")}>
            <Ban className="size-3.5" /> Void ({posted.length})
          </Button>
        ) : null}
        {children}
      </BatchActionBar>

      {voidAction ? (
        <BatchConfirmModal
          open={confirm === "void"}
          onOpenChange={(open) => setConfirm(open ? "void" : null)}
          title={`Void selected ${noun.many}`}
          description={voidAction.description}
          confirmLabel={`Void ${noun.many}`}
          confirmTone="danger"
          itemCount={posted.length}
          itemLabel={posted.length === 1 ? noun.one : noun.many}
          isPending={pending}
          onConfirm={() => run(() => voidAction.action(ids(posted)), { noun, done: "Voided", verb: "void", onSuccess: finish })}
        />
      ) : null}
      {deleteDrafts ? (
        <BatchConfirmModal
          open={confirm === "delete"}
          onOpenChange={(open) => setConfirm(open ? "delete" : null)}
          title={`Delete draft ${noun.many}`}
          description="The selected drafts will be permanently deleted. This cannot be undone."
          confirmLabel="Delete drafts"
          confirmTone="danger"
          itemCount={drafts.length}
          itemLabel={drafts.length === 1 ? `draft ${noun.one}` : `draft ${noun.many}`}
          isPending={pending}
          onConfirm={() => run(() => deleteDrafts(ids(drafts)), { noun, done: "Deleted", verb: "delete", onSuccess: finish })}
        />
      ) : null}
    </>
  );
}
