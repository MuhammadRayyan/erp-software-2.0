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
import { DeliveryNoteRowActions } from "./delivery-note-row-actions";

export type DeliveryNoteRow = {
  id: string;
  delivery_number: string;
  customer_name: string;
  date: string;
  location_code: string;
  quantity_micros: number;
  value_minor: number;
  document_status: string;
};

const COLUMN_LABELS: Record<string, string> = {
  location_code: "Location",
  quantity_micros: "Quantity",
  value_minor: "COGS",
  document_status: "Status",
};

export function DeliveryNoteTable({
  businessId,
  currency,
  rows: rawRows,
  initialFrom = "",
  initialTo = "",
  serverSnapshot,
}: {
  businessId: string;
  currency: string;
  rows: DeliveryNoteRow[];
  initialFrom?: string;
  initialTo?: string;
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [sorting, setSorting] = useState<SortingState>([]);

  const customerOptions = useMemo(
    () => Array.from(new Set(rawRows.map((r) => r.customer_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rawRows],
  );

  const initialColumns = useMemo(
    () => ({ location_code: true, quantity_micros: true, value_minor: true, document_status: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "delivery-notes",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawRows.filter((row) => (
      (!status || row.document_status === status) &&
      (!customerName || row.customer_name === customerName) &&
      (!fromDate || row.date >= fromDate) &&
      (!toDate || row.date <= toDate) &&
      (!q || `${row.delivery_number} ${row.customer_name} ${row.location_code}`.toLowerCase().includes(q))
    ));
  }, [rawRows, status, customerName, fromDate, toDate, query]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "delivery_number",
        header: "Delivery",
        cell: ({ row }: { row: { original: DeliveryNoteRow } }) => (
          <Link href={`/b/${businessId}/sales/delivery-notes/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.delivery_number}
          </Link>
        ),
      },
      { accessorKey: "customer_name", header: "Customer" },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: DeliveryNoteRow } }) => formatDate(row.original.date),
      },
      { accessorKey: "location_code", header: "Location", meta: { className: "tabular" } },
      {
        accessorKey: "quantity_micros",
        header: "Quantity",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: DeliveryNoteRow } }) => (
          <span className="money">{formatQuantityMicros(Number(row.original.quantity_micros))}</span>
        ),
      },
      {
        accessorKey: "value_minor",
        header: "COGS",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: DeliveryNoteRow } }) => (
          <span className="money">{formatMoney(Number(row.original.value_minor), currency)}</span>
        ),
      },
      {
        accessorKey: "document_status",
        header: "Status",
        cell: ({ row }: { row: { original: DeliveryNoteRow } }) => <StatusBadge status={row.original.document_status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-16 text-right" },
        cell: ({ row }: { row: { original: DeliveryNoteRow } }) => (
          <DeliveryNoteRowActions
            businessId={businessId}
            deliveryId={row.original.id}
            deliveryNumber={row.original.delivery_number}
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
    setCustomerName("");
    setStatus("");
    setFromDate("");
    setToDate("");
  };
  const hasActiveFilter = Boolean(query || customerName || status || fromDate || toDate);

  const totalCogs = useMemo(
    () => rows.filter((r) => r.document_status !== "void").reduce((sum, r) => sum + Number(r.value_minor || 0), 0),
    [rows],
  );

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search delivery notes…" ariaLabel="Search delivery notes" />
        <ToolbarSelect
          value={customerName}
          onChange={setCustomerName}
          ariaLabel="Filter by customer"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All customers" }, ...customerOptions.map((name) => ({ value: name, label: name }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          fromAriaLabel="Delivery date from"
          toAriaLabel="Delivery date to"
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
          {customerName && <FilterChip onRemove={() => setCustomerName("")}>Customer: {customerName}</FilterChip>}
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
          noResultsMessage="No delivery notes match"
          onClearFilters={clearFilters}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={rawRows.length}
            itemLabel="delivery notes"
            metrics={[{ label: "Total COGS", value: formatMoney(totalCogs, currency), tone: "primary" }]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
