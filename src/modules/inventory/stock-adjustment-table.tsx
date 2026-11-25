"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ClientListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { ActiveFiltersRow, DateRangeFilter, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatDate, formatMoney, minorToDecimalString, getBusinessTodayIso } from "@/core/format";
import { formatQuantityMicros } from "./inventory-valuation";

export type StockAdjustmentRow = {
  id: string;
  adjustment_number: string;
  date: string;
  item_name: string;
  location_code: string;
  reason: string;
  quantity_delta_micros: number;
  unit_name: string;
  value_minor: number;
  document_status: string;
};

const COLUMN_LABELS: Record<string, string> = {
  location_code: "Location",
  reason: "Reason",
  quantity_delta_micros: "Quantity",
  value_minor: "Value",
  document_status: "Status",
};

export function StockAdjustmentTable({
  businessId,
  currency,
  rows: rawRows,
  serverSnapshot,
}: {
  businessId: string;
  currency: string;
  rows: StockAdjustmentRow[];
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const {
    query,
    status,
    category: locationCode,
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

  const locationOptions = useMemo(
    () => Array.from(new Set(rawRows.map((r) => r.location_code).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rawRows],
  );

  const initialColumns = useMemo(
    () => ({ location_code: true, reason: true, quantity_delta_micros: true, value_minor: true, document_status: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "stock-adjustments",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawRows.filter((row) => (
      (!status || row.document_status === status) &&
      (!locationCode || row.location_code === locationCode) &&
      (!fromDate || row.date >= fromDate) &&
      (!toDate || row.date <= toDate) &&
      (!q || `${row.adjustment_number} ${row.item_name} ${row.location_code} ${row.reason}`.toLowerCase().includes(q))
    ));
  }, [rawRows, status, locationCode, fromDate, toDate, query]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "adjustment_number",
        header: "Adjustment",
        cell: ({ row }: { row: { original: StockAdjustmentRow } }) => (
          <Link href={`/b/${businessId}/inventory/adjustments/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.adjustment_number}
          </Link>
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: StockAdjustmentRow } }) => formatDate(row.original.date),
      },
      { accessorKey: "item_name", header: "Item" },
      { accessorKey: "location_code", header: "Location", meta: { className: "tabular" } },
      { accessorKey: "reason", header: "Reason" },
      {
        accessorKey: "quantity_delta_micros",
        header: "Quantity",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: StockAdjustmentRow } }) => (
          <span className="money">
            {formatQuantityMicros(Number(row.original.quantity_delta_micros))} {row.original.unit_name}
          </span>
        ),
      },
      {
        accessorKey: "value_minor",
        header: "Value",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: StockAdjustmentRow } }) => (
          <span className="money">{formatMoney(Number(row.original.value_minor), currency)}</span>
        ),
      },
      {
        accessorKey: "document_status",
        header: "Status",
        cell: ({ row }: { row: { original: StockAdjustmentRow } }) => <StatusBadge status={row.original.document_status} />,
      },
    ],
    [businessId, currency],
  );

  const { pagination, paginationInfo } = buildPagination(rows.length);

  const table = useTable({
    data: rows,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = resetFilters;
  const hasActiveFilter = Boolean(query || locationCode || status || fromDate || toDate);

  const netValue = useMemo(
    () => rows.filter((r) => r.document_status !== "void").reduce((sum, r) => sum + Number(r.value_minor || 0), 0),
    [rows],
  );

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search adjustments or items…" ariaLabel="Search stock adjustments" />
        <ToolbarSelect
          value={locationCode}
          onChange={(val) => setFilter("category", val)}
          ariaLabel="Filter by location"
          className="min-w-36 max-w-48"
          options={[{ value: "", label: "All locations" }, ...locationOptions.map((code) => ({ value: code, label: code }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(val) => setFilter("from", val)}
          onToChange={(val) => setFilter("to", val)}
          fromAriaLabel="Adjustment date from"
          toAriaLabel="Adjustment date to"
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
            filename={`stock-adjustments-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Adjustment", accessorKey: "adjustment_number" },
              { header: "Date", accessorKey: "date" },
              { header: "Item", accessorKey: "item_name" },
              { header: "Location", accessorKey: "location_code" },
              { header: "Reason", accessorKey: "reason" },
              { header: "Quantity Delta", accessorFn: (r: StockAdjustmentRow) => formatQuantityMicros(Number(r.quantity_delta_micros)) },
              { header: "Value Impact", accessorFn: (r: StockAdjustmentRow) => minorToDecimalString(Number(r.value_minor || 0), currency) },
              { header: "Status", accessorKey: "document_status" },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {locationCode && <FilterChip onRemove={() => setFilter("category", "")}>Location: {locationCode}</FilterChip>}
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
          noResultsMessage="No stock adjustments match"
          onClearFilters={clearFilters}
          getRowHref={(row: StockAdjustmentRow) => `/b/${businessId}/inventory/adjustments/${row.id}`}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={rawRows.length}
            itemLabel="adjustments"
            metrics={[{ label: "Net Value Impact", value: formatMoney(netValue, currency), tone: "primary" }]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
