"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel,
  type LegacyColumnDef as ColumnDef
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { CreditNoteStatus } from "./credit-note-service";

type Row = {
  id: string;
  credit_note_number: string;
  customer_name: string;
  source_invoice_id: string;
  invoice_number: string;
  date: string;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  document_status: CreditNoteStatus;
  projectIds: string[];
  projectNames: string[];
  businessId: string;
};

const COLUMN_LABELS: Record<string, string> = {
  source_invoice_id: "Invoice",
  total_minor: "Total",
  document_status: "Status",
};

export function CreditNoteTable({
  businessId,
  creditNotes,
  serverSnapshot,
}: {
  businessId: string;
  creditNotes: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const projects = useMemo(() => {
    const choices = new Map<string, string>();
    creditNotes.forEach((note) => note.projectIds.forEach((id, index) => choices.set(id, note.projectNames[index] ?? id)));
    return Array.from(choices, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [creditNotes]);

  const initialColumns = useMemo(
    () => ({ source_invoice_id: true, total_minor: true, document_status: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "sales-credit-notes",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(
    () =>
      creditNotes
        .filter((note) => {
          const matchesQuery = `${note.credit_note_number} ${note.customer_name} ${note.invoice_number} ${note.projectNames.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase());
          return (
            (!status || note.document_status === status) &&
            (!projectId || note.projectIds.includes(projectId)) &&
            matchesQuery
          );
        })
        .map((note) => ({ ...note, businessId })),
    [creditNotes, projectId, query, status, businessId],
  );

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "credit_note_number",
        header: "Credit note",
        cell: ({ row }: any) => (
          <Link
            href={`/b/${row.original.businessId}/sales/credit-notes/${row.original.id}`}
            className="tabular font-medium text-primary hover:underline"
          >
            {row.original.credit_note_number}
          </Link>
        ),
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
      },
      {
        id: "projectIds",
        header: "Project",
        cell: ({ row }: any) => (
          row.original.projectIds.length ? (
            row.original.projectIds.map((id: string, index: number) => (
              <span key={id}>
                {index > 0 && ", "}
                <Link
                  href={`/b/${row.original.businessId}/projects/${id}`}
                  className="text-primary hover:underline"
                >
                  {row.original.projectNames[index] ?? id}
                </Link>
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        ),
      },
      {
        accessorKey: "source_invoice_id",
        header: "Invoice",
        cell: ({ row }: any) => (
          row.original.source_invoice_id ? (
            <Link
              href={`/b/${row.original.businessId}/sales/invoices/${row.original.source_invoice_id}`}
              className="tabular text-primary hover:underline"
            >
              {row.original.invoice_number}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: any) => formatDate(row.original.date),
      },
      {
        accessorKey: "total_minor",
        header: "Total",
        meta: { className: "text-right" },
        cell: ({ row }: any) => (
          <span className="money">
            {formatMoney(row.original.total_minor, row.original.currency_code, row.original.currency_minor_unit)}
          </span>
        ),
      },
      {
        accessorKey: "document_status",
        header: "Status",
        cell: ({ row }: any) => <StatusBadge status={row.original.document_status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12" },
        enableSorting: false,
        cell: ({ row }: any) => (
          <Button asChild variant="ghost" size="icon">
            <Link
              href={`/b/${row.original.businessId}/sales/credit-notes/${row.original.id}`}
              aria-label={`Open ${row.original.credit_note_number}`}
            >
              <MoreHorizontal className="size-4" />
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const table = useTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility: colVisibility,
    },
    onSortingChange: setSorting,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
  });

  const hasActiveFilter = Boolean(projectId || status || query);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search credit notes…" ariaLabel="Search credit notes" />
        <ToolbarSelect
          value={projectId}
          onChange={setProjectId}
          ariaLabel="Filter by project"
          options={[{ value: "", label: "All projects" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
        />
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "posted", label: "Posted" },
            { value: "void", label: "Void" },
          ]}
        />
        {dropdown}
      </ListToolbar>
      {hasActiveFilter && (
        <ListToolbar>
          {projectId && (
            <FilterChip onRemove={() => setProjectId("")}>
              Project: {projects.find((p) => p.id === projectId)?.name}
            </FilterChip>
          )}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ListToolbar>
      )}

      <DataTable 
        table={table} 
        minWidth="min-w-[900px]" 
        noResultsMessage="No credit notes match" 
      />
    </>
  );
}
