"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal, Eye, FileEdit, Download } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { DebitNoteStatus } from "./debit-note-service";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";

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
  const { density } = useTableDensity(businessId);

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
        meta: { wrap: true },
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
        meta: { numeric: true },
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
        meta: { className: "w-16 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const dn = row.original;
          const canEdit = dn.document_status === "draft";
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${dn.debit_note_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href={`/b/${dn.businessId}/purchases/debit-notes/${dn.id}`}>
                      <Eye className="size-4 text-muted-foreground" /> View Details
                    </Link>
                  </DropdownMenuItem>
                  {canEdit && (
                    <DropdownMenuItem permission="edit" asChild>
                      <Link href={`/b/${dn.businessId}/purchases/debit-notes/${dn.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Debit Note
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem permission="export" asChild>
                    <a href={`/api/businesses/${dn.businessId}/documents/debit-note/${dn.id}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-4 text-muted-foreground" /> Download PDF
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <Link
                  href={`/b/${dn.businessId}/purchases/debit-notes/${dn.id}`}
                  aria-label={`Open ${dn.debit_note_number}`}
                >
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
          );
        },
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
          className="min-w-36 max-w-52"
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
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {projectId && (
            <FilterChip onRemove={() => setProjectId("")}>
              Project: {projects.find((p) => p.id === projectId)?.name}
            </FilterChip>
          )}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {status}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <DataTable 
        table={table}
        density={density}
        minWidth="min-w-[760px]" 
        noResultsMessage="No debit notes match" 
        onClearFilters={clearFilters}
      />
    </>
  );
}
