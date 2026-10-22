"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, MoreHorizontal, Eye, FileEdit, Download, ShoppingCart, FileText } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState, type RowSelectionState } from "@tanstack/react-table";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { SalesQuoteStatus } from "./quote-service";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";
import { BatchActionBar } from "@/components/batch-action-bar";
import { exportCsv } from "@/lib/export-csv";
import { useLiveRefresh } from "@/components/use-live-refresh";

type Row = {
  id: string;
  quote_number: string;
  revision_number?: number;
  is_latest_revision?: number;
  customer_id: string;
  customer_name: string;
  date: string;
  expected_date: string | null;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  documentStatus: SalesQuoteStatus;
  projectIds: string[];
  projectNames: string[];
  businessId: string; // Passed in mapped data for links
};

const COLUMN_LABELS: Record<string, string> = {
  expected_date: "Expected",
  total_minor: "Total",
  documentStatus: "Status",
};

export function SalesQuoteTable({
  businessId,
  quotes,
  serverSnapshot,
}: {
  businessId: string;
  quotes: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  useLiveRefresh({ intervalMs: 12000, refreshOnMount: true });

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const customerOptions = useMemo(
    () =>
      Array.from(new Map(quotes.map((quote) => [quote.customer_id, quote.customer_name])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [quotes],
  );
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          quotes.flatMap((quote) => quote.projectIds.map((id, index) => [id, quote.projectNames[index] ?? id] as const)),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [quotes],
  );

  const initialColumns = useMemo(
    () => ({ expected_date: true, total_minor: true, documentStatus: true }),
    [],
  );
  
  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "sales-quotes",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(
    () =>
      quotes
        .filter((quote) => {
          const matchesQuery = `${quote.quote_number} ${quote.customer_name}`.toLowerCase().includes(query.trim().toLowerCase());
          return (
            (!status || quote.documentStatus === status) &&
            (!customerId || quote.customer_id === customerId) &&
            (!projectId || quote.projectIds.includes(projectId)) &&
            matchesQuery
          );
        })
        .map((quote) => ({ ...quote, businessId })),
    [quotes, projectId, query, status, customerId, businessId],
  );

  const columns: any[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }: any) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border text-primary focus:ring-ring"
            checked={table.getIsAllPageRowsSelected()}
            ref={(input) => {
              if (input) {
                input.indeterminate = table.getIsSomePageRowsSelected();
              }
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all quotes on page"
          />
        ),
        cell: ({ row }: any) => (
          <input
            type="checkbox"
            className="size-4 rounded border-border text-primary focus:ring-ring"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Select quote ${row.original.quote_number}`}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-8 text-center" },
      },
      {
        accessorKey: "quote_number",
        header: "Quote",
        cell: ({ row }: any) => (
          <div className="flex items-center gap-1.5">
            <Link
              href={`/b/${row.original.businessId}/sales/quotes/${row.original.id}`}
              className="tabular font-medium text-primary hover:underline"
            >
              {row.original.quote_number}
            </Link>
            {row.original.revision_number !== undefined && row.original.revision_number > 0 && (
              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Rev {row.original.revision_number}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
        meta: { wrap: true },
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: any) => formatDate(row.original.date),
      },
      {
        accessorKey: "expected_date",
        header: "Expected",
        cell: ({ row }: any) => row.original.expected_date ? formatDate(row.original.expected_date) : "—",
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
        accessorKey: "documentStatus",
        header: "Status",
        cell: ({ row }: any) => <StatusBadge status={row.original.documentStatus} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-16 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const quote = row.original;
          const canEdit = quote.documentStatus !== "accepted" && quote.documentStatus !== "rejected" && quote.documentStatus !== "cancelled" && quote.documentStatus !== "superseded";
          const canConvert = quote.documentStatus === "sent" || quote.documentStatus === "accepted" || quote.documentStatus === "draft";
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${quote.quote_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem asChild>
                    <Link href={`/b/${quote.businessId}/sales/quotes/${quote.id}`}>
                      <Eye className="size-4 text-muted-foreground" /> View Quote
                    </Link>
                  </DropdownMenuItem>
                  {canEdit && (
                    <DropdownMenuItem asChild>
                      <Link href={`/b/${quote.businessId}/sales/quotes/${quote.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Quote
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <a href={`/api/businesses/${quote.businessId}/documents/sales-quote/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-4 text-muted-foreground" /> Download PDF
                    </a>
                  </DropdownMenuItem>
                  {canConvert && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/b/${quote.businessId}/sales/orders/new?quoteId=${quote.id}`}>
                          <ShoppingCart className="size-4 text-muted-foreground" /> Convert to Order
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/b/${quote.businessId}/sales/invoices/new?quoteId=${quote.id}`}>
                          <FileText className="size-4 text-muted-foreground" /> Convert to Invoice
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                <Link href={`/b/${quote.businessId}/sales/quotes/${quote.id}`} aria-label={`Open ${quote.quote_number}`}>
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
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
  });

  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setCustomerId("");
    setProjectId("");
  };
  const hasActiveFilter = Boolean(customerId || projectId || status || query);

  const totalQuoteValueStr = useMemo(() => {
    const activeRows = (status === "cancelled" || status === "rejected")
      ? rows
      : rows.filter((r) => r.documentStatus !== "cancelled" && r.documentStatus !== "superseded" && r.documentStatus !== "rejected");
    return renderMultiCurrencyString(
      activeRows.map((r) => ({
        amount: r.total_minor,
        currency: r.currency_code,
        minorUnit: r.currency_minor_unit,
      }))
    );
  }, [rows, status]);
  const acceptedCount = useMemo(
    () => rows.filter((r) => r.documentStatus === "accepted").length,
    [rows]
  );

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search sales quotes…" ariaLabel="Search sales quotes" />
        <ToolbarSelect
          value={customerId}
          onChange={setCustomerId}
          ariaLabel="Filter by customer"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={projectId}
          onChange={setProjectId}
          ariaLabel="Filter by project"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {customerId && (
            <FilterChip onRemove={() => setCustomerId("")}>
              Customer: {customerOptions.find(([id]) => id === customerId)?.[1]}
            </FilterChip>
          )}
          {projectId && (
            <FilterChip onRemove={() => setProjectId("")}>
              Project: {projectOptions.find(([id]) => id === projectId)?.[1]}
            </FilterChip>
          )}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      
      <DataTable 
        table={table}
        density={density} 
        minWidth="min-w-[780px]" 
        noResultsMessage="No sales quotes match" 
        onClearFilters={clearFilters}
      />

      {rows.length > 0 && (
        <TableTotalsBar
          filteredCount={rows.length}
          totalCount={quotes.length}
          itemLabel="quotes"
          metrics={[
            { label: "Total Quoted Value", value: totalQuoteValueStr, tone: "primary" },
            ...(acceptedCount > 0
              ? [{ label: "Accepted", value: `${acceptedCount} quotes`, tone: "success" as const }]
              : []),
          ]}
        />
      )}

      <BatchActionBar
        selectedCount={Object.keys(rowSelection).filter((k) => rowSelection[k]).length}
        totalCount={rows.length}
        onClearSelection={() => setRowSelection({})}
        onSelectAll={() => table.toggleAllRowsSelected(true)}
        onExportSelected={() => {
          const selected = table.getSelectedRowModel().rows.map((r: any) => r.original);
          exportCsv(
            `sales-quotes-selected-${new Date().toISOString().slice(0, 10)}.csv`,
            [
              { header: "Quote Number", accessorKey: "quote_number" },
              { header: "Customer", accessorKey: "customer_name" },
              { header: "Date", accessorKey: "date" },
              { header: "Expected Date", accessorKey: "expected_date" },
              { header: "Currency", accessorKey: "currency_code" },
              { header: "Total", accessorFn: (r: any) => (r.total_minor / 100).toFixed(2) },
              { header: "Status", accessorKey: "documentStatus" },
            ],
            selected
          );
        }}
        onPrintSelected={() => window.print()}
      />
    </>
  );
}
