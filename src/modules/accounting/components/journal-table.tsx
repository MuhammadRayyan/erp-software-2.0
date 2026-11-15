"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
import { TableTotalsBar } from "@/components/table-totals-bar";
import { Button } from "@/components/ui/button";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatDate, formatMoney } from "@/core/format";
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
  const [query, setQuery] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

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
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-12 text-right" },
        cell: ({ row }: { row: { original: JournalEntryRow } }) => (
          <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <Link href={`/b/${businessId}/accounting/journal/${row.original.id}`} aria-label={`Open ${row.original.entry_number}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
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
    setSourceType("");
    setFromDate("");
    setToDate("");
  };
  const hasActiveFilter = Boolean(query || sourceType || fromDate || toDate);

  const totalDebit = useMemo(() => rows.reduce((sum, r) => sum + Number(r.debit_minor || 0), 0), [rows]);
  const totalCredit = useMemo(() => rows.reduce((sum, r) => sum + Number(r.credit_minor || 0), 0), [rows]);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search entry # or description…" ariaLabel="Search journal entries" />
        <ToolbarSelect
          value={sourceType}
          onChange={setSourceType}
          ariaLabel="Filter by source"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All sources" }, ...sourceOptions.map(([value, label]) => ({ value, label }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          fromAriaLabel="Journal date from"
          toAriaLabel="Journal date to"
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {sourceType && <FilterChip onRemove={() => setSourceType("")}>Source: {journalSourceLabel(sourceType)}</FilterChip>}
          {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
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
