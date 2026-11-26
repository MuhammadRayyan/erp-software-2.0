"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MoreHorizontal, FileEdit, Download } from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, DateRangeFilter, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { ClientListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";
import { formatDate, formatMoney, minorToDecimalString, getBusinessTodayIso } from "@/core/format";
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
  initialFrom = "",
  initialTo = "",
}: {
  businessId: string;
  debitNotes: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
  initialFrom?: string;
  initialTo?: string;
}) {
  const { density } = useTableDensity(businessId);
  const canEditPerm = useActionPermission("edit");
  const canExportPerm = useActionPermission("export");

  const {
    query,
    supplierId,
    status,
    projectId,
    fromDate: urlFromDate,
    toDate: urlToDate,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState();
  const fromDate = urlFromDate || initialFrom;
  const toDate = urlToDate || initialTo;

  const supplierOptions = useMemo(
    () =>
      Array.from(new Map(debitNotes.map((note) => [note.supplier_id, note.supplier_name])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [debitNotes],
  );

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
            (!supplierId || note.supplier_id === supplierId) &&
            (!projectId || note.projectIds.includes(projectId)) &&
            (!fromDate || note.debit_note_date >= fromDate) &&
            (!toDate || note.debit_note_date <= toDate) &&
            `${note.debit_note_number} ${note.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .map((note) => ({ ...note, businessId })),
    [debitNotes, supplierId, projectId, fromDate, toDate, query, status, businessId],
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
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const dn = row.original;
          const canEdit = dn.document_status !== "void";
          if (!(canEdit && canEditPerm) && !canExportPerm) return null;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${dn.debit_note_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
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
            </div>
          );
        },
      },
    ],
    [canEditPerm, canExportPerm],
  );

  const { pagination, paginationInfo } = buildPagination(rows.length);

  const table = useTable({
    data: rows,
    columns,
    state: {
      sorting,
      pagination,
      columnVisibility: colVisibility,
    },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = resetFilters;
  const hasActiveFilter = Boolean(supplierId || projectId || fromDate || toDate || status || query);

  const totalDebitStr = useMemo(
    () =>
      renderMultiCurrencyString(
        rows
          .filter((r) => r.document_status !== "void")
          .map((r) => ({
            amount: r.total_minor,
            currency: r.currency_code,
            minorUnit: r.currency_minor_unit,
          })),
      ),
    [rows],
  );

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search debit notes…" ariaLabel="Search debit notes" />
        <ToolbarSelect
          value={supplierId}
          onChange={(val) => setFilter("supplierId", val)}
          ariaLabel="Filter by supplier"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={projectId}
          onChange={(val) => setFilter("projectId", val)}
          ariaLabel="Filter by project"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All projects" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(val) => setFilter("from", val)}
          onToChange={(val) => setFilter("to", val)}
          fromAriaLabel="Debit note date from"
          toAriaLabel="Debit note date to"
        />
        <ToolbarSelect
          value={status}
          onChange={(val) => setFilter("status", val)}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "posted", label: "Posted" },
            { value: "void", label: "Void" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename={`debit-notes-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Debit Note", accessorKey: "debit_note_number" },
              { header: "Supplier", accessorKey: "supplier_name" },
              { header: "Date", accessorKey: "debit_note_date" },
              { header: "Reference", accessorKey: "reference" },
              { header: "Currency", accessorKey: "currency_code" },
              { header: "Total", accessorFn: (r: any) => minorToDecimalString(r.total_minor, r.currency_code, r.currency_minor_unit) },
              { header: "Status", accessorKey: "document_status" },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {supplierId && (
            <FilterChip onRemove={() => setFilter("supplierId", "")}>
              Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}
            </FilterChip>
          )}
          {projectId && (
            <FilterChip onRemove={() => setFilter("projectId", "")}>
              Project: {projects.find((p) => p.id === projectId)?.name}
            </FilterChip>
          )}
          {fromDate && <FilterChip onRemove={() => setFilter("from", "")}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setFilter("to", "")}>To: {formatDate(toDate)}</FilterChip>}
          {status && <FilterChip onRemove={() => setFilter("status", "")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <ListTableCard>
        <DataTable 
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-table-lg" 
          noResultsMessage="No debit notes match" 
          onClearFilters={clearFilters}
          getRowHref={(row: Row) => `/b/${row.businessId}/purchases/debit-notes/${row.id}`}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={debitNotes.length}
            itemLabel="debit notes"
            metrics={[{ label: "Total Debited", value: totalDebitStr, tone: "primary" }]}
          />
        )}
        <ClientListPagination
          info={paginationInfo}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ListTableCard>
    </>
  );
}
