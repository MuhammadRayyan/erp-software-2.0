"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { DebitNoteStatus } from "./debit-note-service";

type Row = {
  id: string;
  debit_note_number: string;
  supplier_id: string;
  supplier_name: string;
  debit_note_date: string;
  reference: string | null;
  document_status: DebitNoteStatus;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  projectIds: string[];
  projectNames: string[];
  businessId: string;
};

const COLUMN_LABELS: Record<string, string> = {
  reference: "Reference",
  total: "Total",
  status: "Status",
};

export function DebitNoteTable({
  businessId,
  debitNotes,
  serverSnapshot,
}: {
  businessId: string;
  debitNotes: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const projects = useMemo(() => {
    const choices = new Map<string, string>();
    debitNotes.forEach((note) =>
      note.projectIds.forEach((id, index) => choices.set(id, note.projectNames[index] ?? id)),
    );
    return Array.from(choices, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [debitNotes]);

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "debit-notes",
    businessId,
    serverSnapshot,
    initial: { reference: true, total: true, status: true },
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(
    () =>
      debitNotes
        .filter(
          (note) =>
            (!status || note.document_status === status) &&
            (!projectId || note.projectIds.includes(projectId)) &&
            `${note.debit_note_number} ${note.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .map((note) => ({ ...note, businessId })),
    [debitNotes, projectId, query, status, businessId],
  );

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "debit_note_number",
        header: "Debit Note",
        cell: ({ row }: any) => (
          <Link
            href={`/b/${row.original.businessId}/purchases/debit-notes/${row.original.id}`}
            className="tabular font-medium text-primary hover:underline"
          >
            {row.original.debit_note_number}
          </Link>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: "Supplier",
      },
      {
        accessorKey: "debit_note_date",
        header: "Date",
        cell: ({ row }: any) => formatDate(row.original.debit_note_date),
      },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }: any) => (row.original.reference ? row.original.reference : "—"),
      },
      {
        accessorKey: "total",
        header: "Total",
        meta: { className: "text-right" },
        cell: ({ row }: any) => (
          <span className="money">
            {formatMoney(row.original.total_minor, row.original.currency_code, row.original.currency_minor_unit)}
          </span>
        ),
      },
      {
        accessorKey: "status",
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
              href={`/b/${row.original.businessId}/purchases/debit-notes/${row.original.id}`}
              aria-label={`Open ${row.original.debit_note_number}`}
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

  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setProjectId("");
  };
  const hasActiveFilter = Boolean(projectId || status || query);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search debit notes…" ariaLabel="Search debit notes" />
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
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {status}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ListToolbar>
      )}

      <DataTable 
        table={table} 
        minWidth="min-w-[760px]" 
        noResultsMessage="No debit notes match" 
       onClearFilters={clearFilters}
    />
    </>
  );
}
