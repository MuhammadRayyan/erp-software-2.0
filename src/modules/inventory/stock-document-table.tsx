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
import { StockDocumentRowActions } from "./stock-document-actions-ui";

/** Common shape of a delivery-note / goods-receipt list row. */
export type StockDocumentRow = {
  id: string;
  date: string;
  location_code: string;
  quantity_micros: number;
  value_minor: number;
  document_status: string;
};

/** What differs between the delivery-note and goods-receipt lists. */
export type StockDocumentTableConfig<Row extends StockDocumentRow> = {
  /** URL segment under /b/<businessId>, e.g. "sales/delivery-notes"; also the CSV / column storage key's last part. */
  path: string;
  storageKey: string;
  /** API document type for the PDF route, e.g. "delivery-note". */
  pdfType: string;
  number: (row: Row) => string;
  numberKey: keyof Row & string;
  numberHeader: string;
  csvNumberHeader: string;
  partyName: (row: Row) => string;
  partyKey: keyof Row & string;
  /** "Customer" / "Supplier", and the URL filter parameter that carries the party name. */
  partyLabel: string;
  partyParam: "customerId" | "supplierId";
  /** Value column header ("COGS" / "Value") and totals label. */
  valueLabel: string;
  totalLabel: string;
  /** Plural noun, e.g. "delivery notes". */
  plural: string;
  /** Date filter aria prefix, e.g. "Delivery". */
  dateLabel: string;
  editLabel: string;
};

export function StockDocumentTable<Row extends StockDocumentRow>({
  config,
  businessId,
  currency,
  rows: rawRows,
  serverSnapshot,
}: {
  config: StockDocumentTableConfig<Row>;
  businessId: string;
  currency: string;
  rows: Row[];
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const listState = useUrlListState();
  const { query, status, fromDate, toDate, sorting, setFilter, setPage, setPageSize, onSortingChange, resetFilters, buildPagination } = listState;
  const partyName = listState[config.partyParam];
  const basePath = `/b/${businessId}/${config.path}`;

  const partyOptions = useMemo(
    () => Array.from(new Set(rawRows.map((r) => config.partyName(r)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rawRows, config],
  );

  const initialColumns = useMemo(
    () => ({ location_code: true, quantity_micros: true, value_minor: true, document_status: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: config.storageKey,
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: { location_code: "Location", quantity_micros: "Quantity", value_minor: config.valueLabel, document_status: "Status" },
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawRows.filter((row) => (
      (!status || row.document_status === status) &&
      (!partyName || config.partyName(row) === partyName) &&
      (!fromDate || row.date >= fromDate) &&
      (!toDate || row.date <= toDate) &&
      (!q || `${config.number(row)} ${config.partyName(row)} ${row.location_code}`.toLowerCase().includes(q))
    ));
  }, [rawRows, status, partyName, fromDate, toDate, query, config]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: config.numberKey,
        header: config.numberHeader,
        cell: ({ row }: { row: { original: Row } }) => (
          <Link href={`${basePath}/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {config.number(row.original)}
          </Link>
        ),
      },
      { accessorKey: config.partyKey, header: config.partyLabel },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: Row } }) => formatDate(row.original.date),
      },
      { accessorKey: "location_code", header: "Location", meta: { className: "tabular" } },
      {
        accessorKey: "quantity_micros",
        header: "Quantity",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: Row } }) => (
          <span className="money">{formatQuantityMicros(Number(row.original.quantity_micros))}</span>
        ),
      },
      {
        accessorKey: "value_minor",
        header: config.valueLabel,
        meta: { numeric: true },
        cell: ({ row }: { row: { original: Row } }) => (
          <span className="money">{formatMoney(Number(row.original.value_minor), currency)}</span>
        ),
      },
      {
        accessorKey: "document_status",
        header: "Status",
        cell: ({ row }: { row: { original: Row } }) => <StatusBadge status={row.original.document_status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-16 text-right" },
        cell: ({ row }: { row: { original: Row } }) => (
          <StockDocumentRowActions
            number={config.number(row.original)}
            documentStatus={row.original.document_status}
            editHref={`${basePath}/${row.original.id}/edit`}
            editLabel={config.editLabel}
            pdfHref={`/api/businesses/${businessId}/documents/${config.pdfType}/${row.original.id}/pdf`}
          />
        ),
      },
    ],
    [businessId, currency, basePath, config],
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
  const hasActiveFilter = Boolean(query || partyName || status || fromDate || toDate);

  const totalValue = useMemo(
    () => rows.filter((r) => r.document_status !== "void").reduce((sum, r) => sum + Number(r.value_minor || 0), 0),
    [rows],
  );
  const partyLower = config.partyLabel.toLowerCase();

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder={`Search ${config.plural}…`} ariaLabel={`Search ${config.plural}`} />
        <ToolbarSelect
          value={partyName}
          onChange={(val) => setFilter(config.partyParam, val)}
          ariaLabel={`Filter by ${partyLower}`}
          className="min-w-36 max-w-52"
          options={[{ value: "", label: `All ${partyLower}s` }, ...partyOptions.map((name) => ({ value: name, label: name }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(val) => setFilter("from", val)}
          onToChange={(val) => setFilter("to", val)}
          fromAriaLabel={`${config.dateLabel} date from`}
          toAriaLabel={`${config.dateLabel} date to`}
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
            filename={`${config.storageKey}-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: config.csvNumberHeader, accessorKey: config.numberKey },
              { header: config.partyLabel, accessorKey: config.partyKey },
              { header: "Date", accessorKey: "date" },
              { header: "Location", accessorKey: "location_code" },
              { header: "Quantity", accessorFn: (r: Row) => formatQuantityMicros(Number(r.quantity_micros)) },
              { header: config.valueLabel, accessorFn: (r: Row) => minorToDecimalString(Number(r.value_minor || 0), currency) },
              { header: "Status", accessorKey: "document_status" },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {partyName && <FilterChip onRemove={() => setFilter(config.partyParam, "")}>{config.partyLabel}: {partyName}</FilterChip>}
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
          noResultsMessage={`No ${config.plural} match`}
          onClearFilters={clearFilters}
          getRowHref={(row: Row) => `${basePath}/${row.id}`}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={rawRows.length}
            itemLabel={config.plural}
            metrics={[{ label: config.totalLabel, value: formatMoney(totalValue, currency), tone: "primary" }]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
