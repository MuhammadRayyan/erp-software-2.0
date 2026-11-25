"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MoreHorizontal, FileEdit, Download, FileText } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { ClientListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";
import { formatDate, formatMoney, minorToDecimalString, getBusinessTodayIso } from "@/core/format";
import type { CreditNoteStatus } from "./credit-note-service";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";

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
  initialFrom = "",
  initialTo = "",
}: {
  businessId: string;
  creditNotes: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
  initialFrom?: string;
  initialTo?: string;
}) {
  const { density } = useTableDensity(businessId);
  const canEditPerm = useActionPermission("edit");
  const canExportPerm = useActionPermission("export");

  const {
    query,
    status,
    customerId: customerName,
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

  const customerOptions = useMemo(
    () =>
      Array.from(new Set(creditNotes.map((note) => note.customer_name).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [creditNotes],
  );

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
            (!customerName || note.customer_name === customerName) &&
            (!projectId || note.projectIds.includes(projectId)) &&
            (!fromDate || note.date >= fromDate) &&
            (!toDate || note.date <= toDate) &&
            matchesQuery
          );
        })
        .map((note) => ({ ...note, businessId })),
    [creditNotes, customerName, projectId, fromDate, toDate, query, status, businessId],
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
        meta: { wrap: true },
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
        meta: { numeric: true },
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
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const cn = row.original;
          const canEdit = cn.document_status !== "void";
          const hasUpper = (canEdit && canEditPerm) || canExportPerm;
          const hasLower = Boolean(cn.source_invoice_id);
          if (!hasUpper && !hasLower) return null;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${cn.credit_note_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {canEdit && (
                    <DropdownMenuItem permission="edit" asChild>
                      <Link href={`/b/${cn.businessId}/sales/credit-notes/${cn.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Credit Note
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem permission="export" asChild>
                    <a href={`/api/businesses/${cn.businessId}/documents/sales-credit-note/${cn.id}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-4 text-muted-foreground" /> Download PDF
                    </a>
                  </DropdownMenuItem>
                  {cn.source_invoice_id && (
                    <>
                      {hasUpper && hasLower && <DropdownMenuSeparator />}
                      <DropdownMenuItem asChild>
                        <Link href={`/b/${cn.businessId}/sales/invoices/${cn.source_invoice_id}`}>
                          <FileText className="size-4 text-muted-foreground" /> View Invoice
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
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
  const hasActiveFilter = Boolean(customerName || projectId || fromDate || toDate || status || query);

  const totalCreditStr = useMemo(
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
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search credit notes…" ariaLabel="Search credit notes" />
        <ToolbarSelect
          value={customerName}
          onChange={(val) => setFilter("customerId", val)}
          ariaLabel="Filter by customer"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All customers" }, ...customerOptions.map((name) => ({ value: name, label: name }))]}
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
          fromAriaLabel="Credit note date from"
          toAriaLabel="Credit note date to"
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
            filename={`credit-notes-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Credit Note", accessorKey: "credit_note_number" },
              { header: "Customer", accessorKey: "customer_name" },
              { header: "Invoice", accessorKey: "invoice_number" },
              { header: "Date", accessorKey: "date" },
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
          {customerName && <FilterChip onRemove={() => setFilter("customerId", "")}>Customer: {customerName}</FilterChip>}
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
          minWidth="min-w-[900px]" 
          noResultsMessage="No credit notes match" 
          onClearFilters={clearFilters}
          getRowHref={(row: Row) => `/b/${row.businessId}/sales/credit-notes/${row.id}`}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={creditNotes.length}
            itemLabel="credit notes"
            metrics={[{ label: "Total Credited", value: totalCreditStr, tone: "primary" }]}
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
