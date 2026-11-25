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
import { TableTotalsBar } from "@/components/table-totals-bar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatDate, formatMoney, getBusinessTodayIso, minorToDecimalString } from "@/core/format";
import { journalSourceLabel } from "../journal-source";

export type JournalEntryRow = {
  id: string;
  entry_number: string;
  date: string;
  source_type: string;
  description: string;
  debit_minor: number;
  credit_minor: number;
};

const COLUMN_LABELS: Record<string, string> = {
  date: "Date",
  source_type: "Source",
  description: "Description",
  debit_minor: "Debit",
  credit_minor: "Credit",
};

export function JournalTable({
  businessId,
  currency,
  entries,
  serverSnapshot,
}: {
  businessId: string;
  currency: string;
  entries: JournalEntryRow[];
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const {
    query,
    type: sourceType,
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

  const sourceOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.source_type).filter(Boolean)))
        .map((type) => [type, journalSourceLabel(type)] as const)
        .sort((a, b) => a[1].localeCompare(b[1])),
    [entries],
  );

  const initialColumns = useMemo(
    () => ({ date: true, source_type: true, description: true, debit_minor: true, credit_minor: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "journal-entries",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => (
      (!sourceType || entry.source_type === sourceType) &&
      (!fromDate || entry.date >= fromDate) &&
      (!toDate || entry.date <= toDate) &&
      (!q || `${entry.entry_number} ${entry.description} ${journalSourceLabel(entry.source_type)}`.toLowerCase().includes(q))
    ));
  }, [entries, sourceType, fromDate, toDate, query]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "entry_number",
        header: "Entry",
        cell: ({ row }: { row: { original: JournalEntryRow } }) => (
          <Link href={`/b/${businessId}/accounting/journal/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.entry_number}
          </Link>
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: JournalEntryRow } }) => formatDate(row.original.date),
      },
      {
        accessorKey: "source_type",
        header: "Source",
        cell: ({ row }: { row: { original: JournalEntryRow } }) => journalSourceLabel(row.original.source_type),
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { className: "max-w-[360px] text-muted-foreground" },
      },
      {
        accessorKey: "debit_minor",
        header: "Debit",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: JournalEntryRow } }) => (
          <span className="money">{formatMoney(row.original.debit_minor, currency)}</span>
        ),
      },
      {
        accessorKey: "credit_minor",
        header: "Credit",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: JournalEntryRow } }) => (
          <span className="money">{formatMoney(row.original.credit_minor, currency)}</span>
        ),
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
  const hasActiveFilter = Boolean(query || sourceType || fromDate || toDate);

  const totalDebit = useMemo(() => rows.reduce((sum, r) => sum + Number(r.debit_minor || 0), 0), [rows]);
  const totalCredit = useMemo(() => rows.reduce((sum, r) => sum + Number(r.credit_minor || 0), 0), [rows]);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search entry # or description…" ariaLabel="Search journal entries" />
        <ToolbarSelect
          value={sourceType}
          onChange={(val) => setFilter("type", val)}
          ariaLabel="Filter by source"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All sources" }, ...sourceOptions.map(([value, label]) => ({ value, label }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(val) => setFilter("from", val)}
          onToChange={(val) => setFilter("to", val)}
          fromAriaLabel="Journal date from"
          toAriaLabel="Journal date to"
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename={`journal-entries-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Entry", accessorKey: "entry_number" },
              { header: "Date", accessorKey: "date" },
              { header: "Source", accessorFn: (r: JournalEntryRow) => journalSourceLabel(r.source_type) },
              { header: "Description", accessorKey: "description" },
              { header: "Debit", accessorFn: (r: JournalEntryRow) => minorToDecimalString(Number(r.debit_minor || 0), currency) },
              { header: "Credit", accessorFn: (r: JournalEntryRow) => minorToDecimalString(Number(r.credit_minor || 0), currency) },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {sourceType && <FilterChip onRemove={() => setFilter("type", "")}>Source: {journalSourceLabel(sourceType)}</FilterChip>}
          {fromDate && <FilterChip onRemove={() => setFilter("from", "")}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setFilter("to", "")}>To: {formatDate(toDate)}</FilterChip>}
          {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[760px]"
          noResultsMessage="No journal entries match"
          onClearFilters={clearFilters}
          getRowHref={(row: JournalEntryRow) => `/b/${businessId}/accounting/journal/${row.id}`}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={entries.length}
            itemLabel="entries"
            metrics={[
              { label: "Total Debit", value: formatMoney(totalDebit, currency) },
              { label: "Total Credit", value: formatMoney(totalCredit, currency), tone: "primary" },
            ]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
