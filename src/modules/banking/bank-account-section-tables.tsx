"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useTableDensity } from "@/components/use-table-density";
import { ClientListPagination } from "@/components/list-pagination";
import { TableTotalsBar } from "@/components/table-totals-bar";
import {
  ActiveFiltersRow,
  DateRangeFilter,
  FilterChip,
  ListToolbar,
  SearchInput,
  ToolbarSelect,
} from "@/components/list-toolbar";
import { formatDate, formatMoney, minorToDecimalString } from "@/core/format";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { StatementLineActions } from "./statement-line-actions";
import type { MatchCandidate } from "./matching-types";

export type SerializedBankHistoryRow = {
  journal_entry_id: string;
  entry_number: string;
  date: string;
  source_type: string;
  source_id: string;
  sourceLabel: string;
  sourceHref: string | null;
  description: string;
  reference: string | null;
  money_in_minor: number;
  money_out_minor: number;
  balance_minor: number;
  reconciled: number;
};

export type SerializedStatementLine = {
  id: string;
  transaction_date: string;
  description: string;
  reference: string | null;
  amount_minor: number;
  match_status: "unmatched" | "matched" | "created" | "ignored";
  reconciled: number;
  sourceHref: string | null;
  candidates: MatchCandidate[];
  matchedRule: { id: string; name: string } | null;
};

const TRANSACTION_COLUMN_LABELS: Record<string, string> = {
  sourceLabel: "Type",
  reference: "Reference",
  description: "Description",
  money_in_minor: "Money In",
  money_out_minor: "Money Out",
  balance_minor: "Balance",
  reconciled: "Reconciled",
};

const IMPORTED_COLUMN_LABELS: Record<string, string> = {
  description: "Description",
  reference: "Reference",
  amount_minor: "Amount",
  match_status: "Status",
};

export function BankAccountTransactionsTable({
  businessId,
  currency,
  rows,
}: {
  businessId: string;
  currency: string;
  rows: SerializedBankHistoryRow[];
}) {
  const { density } = useTableDensity(businessId);
  const {
    query,
    fromDate,
    toDate,
    status: reconciledFilter,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState();

  const initialColumns = useMemo(
    () => ({
      sourceLabel: true,
      reference: true,
      description: true,
      money_in_minor: true,
      money_out_minor: true,
      balance_minor: true,
      reconciled: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "bank-account-transactions",
    businessId,
    initial: initialColumns,
    labels: TRANSACTION_COLUMN_LABELS,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (reconciledFilter === "reconciled" && !row.reconciled) return false;
      if (reconciledFilter === "outstanding" && row.reconciled) return false;
      if (fromDate && row.date < fromDate) return false;
      if (toDate && row.date > toDate) return false;
      if (!q) return true;
      return (
        row.entry_number.toLowerCase().includes(q) ||
        row.sourceLabel.toLowerCase().includes(q) ||
        (row.reference ?? "").toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q)
      );
    });
  }, [rows, query, reconciledFilter, fromDate, toDate]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: { row: { original: SerializedBankHistoryRow } }) => formatDate(row.original.date),
      },
      {
        accessorKey: "sourceLabel",
        header: "Type",
        cell: ({ row }: { row: { original: SerializedBankHistoryRow } }) =>
          row.original.sourceHref ? (
            <Link href={row.original.sourceHref} className="font-medium text-primary hover:underline">
              {row.original.sourceLabel}
            </Link>
          ) : (
            row.original.sourceLabel
          ),
      },
      {
        accessorKey: "reference",
        header: "Reference",
        meta: { className: "tabular text-muted-foreground" },
        cell: ({ row }: { row: { original: SerializedBankHistoryRow } }) =>
          row.original.reference || row.original.entry_number,
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { className: "max-w-72 truncate" },
      },
      {
        accessorKey: "money_in_minor",
        header: "Money In",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: SerializedBankHistoryRow } }) =>
          row.original.money_in_minor ? formatMoney(row.original.money_in_minor, currency) : "—",
      },
      {
        accessorKey: "money_out_minor",
        header: "Money Out",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: SerializedBankHistoryRow } }) =>
          row.original.money_out_minor ? formatMoney(row.original.money_out_minor, currency) : "—",
      },
      {
        accessorKey: "balance_minor",
        header: "Balance",
        meta: { numeric: true, className: "font-medium" },
        cell: ({ row }: { row: { original: SerializedBankHistoryRow } }) =>
          formatMoney(row.original.balance_minor, currency),
      },
      {
        accessorKey: "reconciled",
        header: "Reconciled",
        cell: ({ row }: { row: { original: SerializedStatementLine | SerializedBankHistoryRow } }) => (
          <Badge tone={row.original.reconciled ? "success" : "neutral"}>
            {row.original.reconciled ? "Reconciled" : "Outstanding"}
          </Badge>
        ),
      },
    ],
    [currency],
  );

  const { pagination, paginationInfo } = buildPagination(filtered.length);

  const table = useTable({
    data: filtered,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const totalInMinor = useMemo(() => filtered.reduce((sum, r) => sum + r.money_in_minor, 0), [filtered]);
  const totalOutMinor = useMemo(() => filtered.reduce((sum, r) => sum + r.money_out_minor, 0), [filtered]);
  const hasActiveFilter = Boolean(query || reconciledFilter || fromDate || toDate);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface py-10 text-center">
        <p className="font-medium">No GL activity for this account</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Post a Receipt, Supplier Payment, Bank Transaction, or Transfer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={(v) => setFilter("q", v)}
          placeholder="Search type, reference, description…"
          ariaLabel="Search bank transactions"
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(v) => setFilter("from", v)}
          onToChange={(v) => setFilter("to", v)}
          fromAriaLabel="Transaction date from"
          toAriaLabel="Transaction date to"
        />
        <ToolbarSelect
          value={reconciledFilter}
          onChange={(v) => setFilter("status", v)}
          ariaLabel="Filter by reconciliation state"
          options={[
            { value: "", label: "All entries" },
            { value: "reconciled", label: "Reconciled" },
            { value: "outstanding", label: "Outstanding" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename="bank-transactions"
            data={filtered}
            columns={[
              { header: "Date", accessorKey: "date" },
              { header: "Type", accessorKey: "sourceLabel" },
              { header: "Reference", accessorFn: (r) => r.reference || r.entry_number },
              { header: "Description", accessorKey: "description" },
              { header: "Money In", accessorFn: (r) => (r.money_in_minor ? minorToDecimalString(r.money_in_minor, currency) : "") },
              { header: "Money Out", accessorFn: (r) => (r.money_out_minor ? minorToDecimalString(r.money_out_minor, currency) : "") },
              { header: "Balance", accessorFn: (r) => minorToDecimalString(r.balance_minor, currency) },
              { header: "Reconciled", accessorFn: (r) => (r.reconciled ? "Reconciled" : "Outstanding") },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={resetFilters}>
          {fromDate && <FilterChip onRemove={() => setFilter("from", "")}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setFilter("to", "")}>To: {formatDate(toDate)}</FilterChip>}
          {reconciledFilter && (
            <FilterChip onRemove={() => setFilter("status", "")}>
              Reconciled: {reconciledFilter === "reconciled" ? "Reconciled" : "Outstanding"}
            </FilterChip>
          )}
          {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[1050px]"
          getRowHref={(row) => row.sourceHref}
          noResultsMessage="No bank transactions match"
          onClearFilters={hasActiveFilter ? resetFilters : undefined}
        />
        {filtered.length > 0 && (
          <TableTotalsBar
            filteredCount={filtered.length}
            totalCount={rows.length}
            itemLabel="transactions"
            metrics={[
              { label: "Money In", value: formatMoney(totalInMinor, currency), tone: "success" },
              { label: "Money Out", value: formatMoney(totalOutMinor, currency), tone: "default" },
            ]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </div>
  );
}

export function BankAccountImportedTable({
  businessId,
  accountId,
  currency,
  isCashAccount,
  lines,
}: {
  businessId: string;
  accountId: string;
  currency: string;
  isCashAccount: boolean;
  lines: SerializedStatementLine[];
}) {
  const { density } = useTableDensity(businessId);
  const {
    query,
    fromDate,
    toDate,
    status: statusFilter,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState();

  const initialColumns = useMemo(
    () => ({
      description: true,
      reference: true,
      amount_minor: true,
      match_status: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "bank-account-imported-lines",
    businessId,
    initial: initialColumns,
    labels: IMPORTED_COLUMN_LABELS,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((line) => {
      if (statusFilter && line.match_status !== statusFilter) return false;
      if (fromDate && line.transaction_date < fromDate) return false;
      if (toDate && line.transaction_date > toDate) return false;
      if (!q) return true;
      return (
        line.description.toLowerCase().includes(q) ||
        (line.reference ?? "").toLowerCase().includes(q)
      );
    });
  }, [lines, query, statusFilter, fromDate, toDate]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "transaction_date",
        header: "Date",
        cell: ({ row }: { row: { original: SerializedStatementLine } }) =>
          formatDate(row.original.transaction_date),
      },
      {
        accessorKey: "description",
        header: "Description",
        meta: { className: "max-w-72 truncate" },
      },
      {
        accessorKey: "reference",
        header: "Reference",
        meta: { className: "text-muted-foreground" },
        cell: ({ row }: { row: { original: SerializedStatementLine } }) => row.original.reference || "—",
      },
      {
        accessorKey: "amount_minor",
        header: "Amount",
        meta: { numeric: true, className: "font-medium" },
        cell: ({ row }: { row: { original: SerializedStatementLine } }) => (
          <>
            {row.original.amount_minor > 0 ? "+ " : row.original.amount_minor < 0 ? "− " : ""}
            {formatMoney(Math.abs(row.original.amount_minor), currency)}
          </>
        ),
      },
      {
        accessorKey: "match_status",
        header: "Status",
        cell: ({ row }: { row: { original: SerializedStatementLine } }) => {
          const line = row.original;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  line.match_status === "unmatched"
                    ? "warning"
                    : line.match_status === "ignored"
                      ? "neutral"
                      : "success"
                }
              >
                {line.match_status === "created"
                  ? "Created"
                  : line.match_status[0].toUpperCase() + line.match_status.slice(1)}
              </Badge>
              {line.reconciled ? <span className="text-xs text-success">Reconciled</span> : null}
              {line.sourceHref && (
                <Link href={line.sourceHref} className="text-xs text-primary hover:underline">
                  Open source
                </Link>
              )}
            </div>
          );
        },
      },
      {
        id: "review",
        header: "Review",
        enableSorting: false,
        enableHiding: false,
        meta: { className: "py-2! whitespace-normal" },
        cell: ({ row }: { row: { original: SerializedStatementLine } }) => {
          const line = row.original;
          return (
            <StatementLineActions
              businessId={businessId}
              accountId={accountId}
              lineId={line.id}
              status={line.match_status}
              currency={currency}
              candidates={line.candidates}
              amountMinor={line.amount_minor}
              transactionDate={line.transaction_date}
              reference={line.reference}
              description={line.description}
              matchedRule={line.matchedRule}
            />
          );
        },
      },
    ],
    [accountId, businessId, currency],
  );

  const { pagination, paginationInfo } = buildPagination(filtered.length);

  const table = useTable({
    data: filtered,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const hasActiveFilter = Boolean(query || statusFilter || fromDate || toDate);
  const unmatchedCount = useMemo(
    () => filtered.filter((l) => l.match_status === "unmatched").length,
    [filtered],
  );

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface py-10 text-center">
        <p className="font-medium">No statement lines yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Import a CSV statement to begin matching.</p>
        {!isCashAccount && (
          <Button permission="create" asChild className="mt-4">
            <Link href={`/b/${businessId}/banking/accounts/${accountId}/import`}>Import Statement</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={(v) => setFilter("q", v)}
          placeholder="Search statement description, reference…"
          ariaLabel="Search imported statement lines"
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(v) => setFilter("from", v)}
          onToChange={(v) => setFilter("to", v)}
          fromAriaLabel="Statement date from"
          toAriaLabel="Statement date to"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={(v) => setFilter("status", v)}
          ariaLabel="Filter by match status"
          options={[
            { value: "", label: "All statuses" },
            { value: "unmatched", label: "Unmatched" },
            { value: "matched", label: "Matched" },
            { value: "created", label: "Created" },
            { value: "ignored", label: "Ignored" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename="bank-statement-lines"
            data={filtered}
            columns={[
              { header: "Date", accessorKey: "transaction_date" },
              { header: "Description", accessorKey: "description" },
              { header: "Reference", accessorFn: (r) => r.reference ?? "" },
              { header: "Direction", accessorFn: (r) => (r.amount_minor > 0 ? "Money In" : r.amount_minor < 0 ? "Money Out" : "Zero") },
              { header: "Amount", accessorFn: (r) => minorToDecimalString(Math.abs(r.amount_minor), currency) },
              { header: "Status", accessorKey: "match_status" },
              { header: "Reconciled", accessorFn: (r) => (r.reconciled ? "Yes" : "No") },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={resetFilters}>
          {fromDate && <FilterChip onRemove={() => setFilter("from", "")}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setFilter("to", "")}>To: {formatDate(toDate)}</FilterChip>}
          {statusFilter && <FilterChip onRemove={() => setFilter("status", "")}>Status: {statusFilter}</FilterChip>}
          {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[980px]"
          noResultsMessage="No statement lines match"
          onClearFilters={hasActiveFilter ? resetFilters : undefined}
        />
        {filtered.length > 0 && (
          <TableTotalsBar
            filteredCount={filtered.length}
            totalCount={lines.length}
            itemLabel="lines"
            metrics={[
              { label: "Unmatched", value: String(unmatchedCount), tone: unmatchedCount > 0 ? "warning" : "success" },
            ]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </div>
  );
}
