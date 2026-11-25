"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MoreHorizontal, FileEdit, Download, ShoppingCart } from "lucide-react";
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
import { formatDate, formatMoney, minorToDecimalString, getBusinessTodayIso } from "@/core/format";
import type { PurchaseQuoteStatus } from "./purchase-quote-service";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";

type Row = {
  id: string;
  quote_number: string;
  revision_number?: number;
  is_latest_revision?: number;
  supplier_id: string;
  supplier_name: string;
  date: string;
  expected_date: string | null;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  documentStatus: PurchaseQuoteStatus;
  projectIds: string[];
  projectNames: string[];
  businessId: string; // Passed in mapped data for links
};

const COLUMN_LABELS: Record<string, string> = {
  expected_date: "Expiry Date",
  total_minor: "Total",
  documentStatus: "Status",
};

export function PurchaseQuoteTable({
  businessId,
  quotes,
  serverSnapshot,
}: {
  businessId: string;
  quotes: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const canEditPerm = useActionPermission("edit");
  const canExportPerm = useActionPermission("export");
  const canCreatePerm = useActionPermission("create");

  const {
    query,
    status,
    supplierId,
    projectId,
    fromDate,
    toDate,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState();

  const supplierOptions = useMemo(
    () =>
      Array.from(new Map(quotes.map((quote) => [quote.supplier_id, quote.supplier_name])).entries()).sort((a, b) =>
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
    storageKey: "purchase-quotes",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(
    () =>
      quotes
        .filter((quote) => {
          const matchesQuery = `${quote.quote_number} ${quote.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase());
          return (
            (!status || quote.documentStatus === status) &&
            (!supplierId || quote.supplier_id === supplierId) &&
            (!projectId || quote.projectIds.includes(projectId)) &&
            (!fromDate || quote.date >= fromDate) &&
            (!toDate || quote.date <= toDate) &&
            matchesQuery
          );
        })
        .map((quote) => ({ ...quote, businessId })),
    [quotes, projectId, query, status, supplierId, fromDate, toDate, businessId],
  );

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "quote_number",
        header: "Quote Number",
        cell: ({ row }: any) => (
          <div className="flex items-center gap-1.5">
            <Link
              href={`/b/${row.original.businessId}/purchases/quotes/${row.original.id}`}
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
        accessorKey: "supplier_name",
        header: "Supplier",
        meta: { wrap: true },
      },
      {
        accessorKey: "date",
        header: "Quote Date",
        cell: ({ row }: any) => formatDate(row.original.date),
      },
      {
        accessorKey: "expected_date",
        header: "Expiry Date",
        cell: ({ row }: any) => (row.original.expected_date ? formatDate(row.original.expected_date) : "—"),
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
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const quote = row.original;
          const canEdit = quote.documentStatus !== "accepted" && quote.documentStatus !== "rejected" && quote.documentStatus !== "cancelled" && quote.documentStatus !== "superseded";
          const canConvert = quote.documentStatus === "sent";
          const hasUpper = (canEdit && canEditPerm) || canExportPerm;
          const hasLower = canConvert && canCreatePerm;
          if (!hasUpper && !hasLower) return null;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${quote.quote_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {canEdit && (
                    <DropdownMenuItem permission="edit" asChild>
                      <Link href={`/b/${quote.businessId}/purchases/quotes/${quote.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Quote
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem permission="export" asChild>
                    <a href={`/api/businesses/${quote.businessId}/documents/purchase-quote/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-4 text-muted-foreground" /> Download PDF
                    </a>
                  </DropdownMenuItem>
                  {canConvert && (
                    <>
                      {hasUpper && hasLower && <DropdownMenuSeparator />}
                      <DropdownMenuItem permission="create" asChild>
                        <Link href={`/b/${quote.businessId}/purchases/orders/new?quoteId=${quote.id}`}>
                          <ShoppingCart className="size-4 text-muted-foreground" /> Convert to Purchase Order
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
    [canCreatePerm, canEditPerm, canExportPerm],
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
        <SearchInput
          value={query}
          onChange={(val) => setFilter("q", val)}
          placeholder="Search purchase quotes…"
          ariaLabel="Search purchase quotes"
        />
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
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(val) => setFilter("from", val)}
          onToChange={(val) => setFilter("to", val)}
          fromAriaLabel="Quote date from"
          toAriaLabel="Quote date to"
        />
        <ToolbarSelect
          value={status}
          onChange={(val) => setFilter("status", val)}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Issued / Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "superseded", label: "Superseded" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename={`purchase-quotes-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Quote Number", accessorKey: "quote_number" },
              { header: "Supplier", accessorKey: "supplier_name" },
              { header: "Date", accessorKey: "date" },
              { header: "Expiry Date", accessorKey: "expected_date" },
              { header: "Currency", accessorKey: "currency_code" },
              { header: "Total", accessorFn: (r: any) => minorToDecimalString(r.total_minor, r.currency_code, r.currency_minor_unit) },
              { header: "Status", accessorKey: "documentStatus" },
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
              Project: {projectOptions.find(([id]) => id === projectId)?.[1]}
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
          minWidth="min-w-[780px]"
          noResultsMessage="No purchase quotes match"
          onClearFilters={clearFilters}
          getRowHref={(row: Row) => `/b/${row.businessId}/purchases/quotes/${row.id}`}
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
        <ClientListPagination
          info={paginationInfo}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ListTableCard>
    </>
  );
}
