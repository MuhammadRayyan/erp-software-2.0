"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ClientListPagination, useTablePagination } from "@/components/list-pagination";
import { ActiveFiltersRow, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatBytes, formatDateTime } from "@/core/format";
import { parseMailboxes } from "./mailbox-utils";
import { getRelatedDocumentPath } from "./email-links";

export type SentEmailRow = {
  id: string;
  subject: string;
  fromAddress: string;
  toAddresses: string;
  ccAddresses: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedDocumentNumber: string | null;
  attachmentFilename: string | null;
  attachmentSizeBytes: number | null;
  createdAt: string;
  status: string;
};

const COLUMN_LABELS: Record<string, string> = {
  toAddresses: "To",
  relatedDocumentNumber: "Related",
  attachmentFilename: "Attachment",
  createdAt: "Sent",
  status: "Status",
};

export function SentEmailTable({
  businessId,
  emails,
  serverSnapshot,
}: {
  businessId: string;
  emails: SentEmailRow[];
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const initialColumns = useMemo(
    () => ({
      toAddresses: true,
      relatedDocumentNumber: true,
      attachmentFilename: true,
      createdAt: true,
      status: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "sent-emails",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails.filter((email) => (
      (!status || email.status === status) &&
      (!q || `${email.subject} ${email.toAddresses} ${email.relatedDocumentNumber ?? ""}`.toLowerCase().includes(q))
    ));
  }, [emails, query, status]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "subject",
        header: "Subject",
        meta: { wrap: true },
        cell: ({ row }: { row: { original: SentEmailRow } }) => (
          <>
            <Link href={`/b/${businessId}/emails/${row.original.id}`} className="font-medium text-primary hover:underline">
              {row.original.subject}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">From {row.original.fromAddress}</p>
          </>
        ),
      },
      {
        accessorKey: "toAddresses",
        header: "To",
        meta: { wrap: true },
        cell: ({ row }: { row: { original: SentEmailRow } }) => {
          const mailboxes = parseMailboxes(row.original.toAddresses);
          const to = mailboxes[0];
          const extra = mailboxes.length - 1;
          return (
            <div>
              <span className="font-medium">{to ? (to.name ? `${to.name} <${to.email}>` : to.email) : "—"}</span>
              {extra > 0 && <span className="ml-1 text-xs text-muted-foreground">+{extra} more</span>}
              {row.original.ccAddresses && (
                <p className="mt-0.5 text-xs text-muted-foreground">CC: {row.original.ccAddresses}</p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "relatedDocumentNumber",
        header: "Related",
        cell: ({ row }: { row: { original: SentEmailRow } }) => {
          const relatedHref = getRelatedDocumentPath(
            businessId,
            row.original.relatedEntityType,
            row.original.relatedEntityId,
          );
          if (relatedHref && row.original.relatedDocumentNumber) {
            return (
              <Link href={relatedHref} className="font-medium text-primary hover:underline tabular">
                {row.original.relatedDocumentNumber}
              </Link>
            );
          }
          return <span className="text-muted-foreground">{row.original.relatedDocumentNumber || "—"}</span>;
        },
      },
      {
        accessorKey: "attachmentFilename",
        header: "Attachment",
        cell: ({ row }: { row: { original: SentEmailRow } }) =>
          row.original.attachmentFilename ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="size-3.5" />
              {row.original.attachmentFilename}
              <span className="text-muted-foreground/60">· {formatBytes(row.original.attachmentSizeBytes)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Sent",
        meta: { className: "text-muted-foreground" },
        cell: ({ row }: { row: { original: SentEmailRow } }) => formatDateTime(row.original.createdAt),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: { row: { original: SentEmailRow } }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [businessId],
  );

  const { pagination, onPaginationChange, paginationInfo, setPage, setPageSize } = useTablePagination(rows.length);

  const table = useTable({
    data: rows,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange: setSorting,
    onPaginationChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = () => {
    setQuery("");
    setStatus("");
  };
  const hasActiveFilter = Boolean(query || status);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search subject, recipient, or document…" ariaLabel="Search sent emails" />
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "sent", label: "Sent" },
            { value: "delivered", label: "Delivered" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[860px]"
          noResultsMessage="No sent emails match"
          onClearFilters={clearFilters}
        />
        {rows.length > 0 && (
          <TableTotalsBar filteredCount={rows.length} totalCount={emails.length} itemLabel="emails" />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
