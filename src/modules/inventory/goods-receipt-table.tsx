"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { ActiveFiltersRow, DateRangeFilter, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatDate, formatMoney } from "@/core/format";
import { formatQuantityMicros } from "./inventory-valuation";
import { GoodsReceiptRowActions } from "./goods-receipt-row-actions";

export type GoodsReceiptRow = {
  id: string;
  receipt_number: string;
  supplier_name: string;
  date: string;
  location_code: string;
  quantity_micros: number;
  value_minor: number;
  document_status: string;
};

const COLUMN_LABELS: Record<string, string> = {
  location_code: "Location",
  quantity_micros: "Quantity",
  value_minor: "Value",
  document_status: "Status",
};

export function GoodsReceiptTable({
  businessId,
  currency,
  rows: rawRows,
  initialFrom = "",
  initialTo = "",
  serverSnapshot,
}: {
  businessId: string;
  currency: string;
  rows: GoodsReceiptRow[];
  initialFrom?: string;
  initialTo?: string;
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [sorting, setSorting] = useState<SortingState>([]);

  const supplierOptions = useMemo(
    () => Array.from(new Set(rawRows.map((r) => r.supplier_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rawRows],
  );

  const initialColumns = useMemo(
    () => ({ location_code: true, quantity_micros: true, value_minor: true, document_status: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "goods-receipts",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawRows.filter((row) => (
      (!status || row.document_status === status) &&
      (!supplierName || row.supplier_name === supplierName) &&
      (!fromDate || row.date >= fromDate) &&
      (!toDate || row.date <= toDate) &&
      (!q || `${row.receipt_number} ${row.supplier_name} ${row.location_code}`.toLowerCase().includes(q))
    ));
  }, [rawRows, status, supplierName, fromDate, toDate, query]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "receipt_number",
        header: "Receipt",
        cell: ({ row }: { row: { original: GoodsReceiptRow } }) => (
          <Link href={`/b/${businessId}/purchases/goods-receipts/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.receipt_number}
          </Link>
        ),
      },
      { accessorKey: "supplier_name", header: "Supplier" },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: GoodsReceiptRow } }) => formatDate(row.original.date),
      },
      { accessorKey: "location_code", header: "Location", meta: { className: "tabular" } },
      {
        accessorKey: "quantity_micros",
        header: "Quantity",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: GoodsReceiptRow } }) => (
          <span className="money">{formatQuantityMicros(Number(row.original.quantity_micros))}</span>
        ),
      },
      {
        accessorKey: "value_minor",
        header: "Value",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: GoodsReceiptRow } }) => (
          <span className="money">{formatMoney(Number(row.original.value_minor), currency)}</span>
        ),
      },
      {
        accessorKey: "document_status",
        header: "Status",
        cell: ({ row }: { row: { original: GoodsReceiptRow } }) => <StatusBadge status={row.original.document_status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-16 text-right" },
        cell: ({ row }: { row: { original: GoodsReceiptRow } }) => (
          <GoodsReceiptRowActions
            businessId={businessId}
            receiptId={row.original.id}
            receiptNumber={row.original.receipt_number}
            documentStatus={row.original.document_status}
          />
        ),
      },
    ],
    [businessId, currency],
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
    setSupplierName("");
    setStatus("");
    setFromDate("");
    setToDate("");
  };
  const hasActiveFilter = Boolean(query || supplierName || status || fromDate || toDate);

  const totalValue = useMemo(
    () => rows.filter((r) => r.document_status !== "void").reduce((sum, r) => sum + Number(r.value_minor || 0), 0),
    [rows],
  );

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search goods receipts…" ariaLabel="Search goods receipts" />
        <ToolbarSelect
          value={supplierName}
          onChange={setSupplierName}
          ariaLabel="Filter by supplier"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map((name) => ({ value: name, label: name }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          fromAriaLabel="Receipt date from"
          toAriaLabel="Receipt date to"
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
          {supplierName && <FilterChip onRemove={() => setSupplierName("")}>Supplier: {supplierName}</FilterChip>}
          {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[800px]"
          noResultsMessage="No goods receipts match"
          onClearFilters={clearFilters}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={rawRows.length}
            itemLabel="goods receipts"
            metrics={[{ label: "Total Received Value", value: formatMoney(totalValue, currency), tone: "primary" }]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
