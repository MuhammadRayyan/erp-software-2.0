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
import { ActiveFiltersRow, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { StatusBadge } from "@/components/status-badge";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatMoney, getBusinessTodayIso, minorToDecimalString } from "@/core/format";
import { BankAccountRowActions } from "./bank-account-row-actions";

export type BankAccountRow = {
  id: string;
  name: string;
  is_cash_account: number | boolean;
  bank_name: string | null;
  ledger_name: string;
  currency_code: string;
  book_balance_minor: number;
  statement_balance_minor: number | null;
  unreconciled_count: number;
  is_active: number | boolean;
};

const COLUMN_LABELS: Record<string, string> = {
  bank_name: "Institution",
  ledger_name: "Mapped GL",
  currency_code: "Currency",
  book_balance_minor: "Book Balance",
  statement_balance_minor: "Statement Balance",
  unreconciled_count: "Unmatched",
  is_active: "Status",
};

export function BankAccountTable({
  businessId,
  baseCurrency,
  accounts,
  serverSnapshot,
}: {
  businessId: string;
  baseCurrency: string;
  accounts: BankAccountRow[];
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const {
    query,
    type: kindFilter,
    status: statusFilter,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState({ defaultSort: "name", defaultDir: "asc" });

  const initialColumns = useMemo(
    () => ({
      bank_name: true,
      ledger_name: true,
      currency_code: true,
      book_balance_minor: true,
      statement_balance_minor: true,
      unreconciled_count: true,
      is_active: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "bank-accounts",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const isCash = Boolean(account.is_cash_account);
      if (kindFilter === "bank" && isCash) return false;
      if (kindFilter === "cash" && !isCash) return false;
      const isActive = Boolean(account.is_active);
      if (statusFilter === "active" && !isActive) return false;
      if (statusFilter === "inactive" && isActive) return false;
      if (!q) return true;
      return `${account.name} ${account.bank_name ?? ""} ${account.ledger_name} ${account.currency_code}`.toLowerCase().includes(q);
    });
  }, [accounts, query, kindFilter, statusFilter]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Account",
        cell: ({ row }: { row: { original: BankAccountRow } }) => (
          <>
            <Link href={`/b/${businessId}/banking/accounts/${row.original.id}`} className="font-medium text-primary hover:underline">
              {row.original.name}
            </Link>
            <span className="ml-2 text-xs text-muted-foreground">{row.original.is_cash_account ? "Cash" : "Bank"}</span>
          </>
        ),
      },
      {
        accessorKey: "bank_name",
        header: "Institution",
        cell: ({ row }: { row: { original: BankAccountRow } }) =>
          row.original.is_cash_account ? "—" : row.original.bank_name || "—",
      },
      { accessorKey: "ledger_name", header: "Mapped GL" },
      { accessorKey: "currency_code", header: "Currency", meta: { className: "tabular" } },
      {
        accessorKey: "book_balance_minor",
        header: "Book Balance",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: BankAccountRow } }) => (
          <span className="money font-medium">{formatMoney(row.original.book_balance_minor, baseCurrency)}</span>
        ),
      },
      {
        accessorKey: "statement_balance_minor",
        header: "Statement Balance",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: BankAccountRow } }) => (
          <span className="money">
            {row.original.statement_balance_minor === null
              ? "Not reconciled"
              : formatMoney(row.original.statement_balance_minor, baseCurrency)}
          </span>
        ),
      },
      {
        accessorKey: "unreconciled_count",
        header: "Unmatched",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: BankAccountRow } }) => (
          <span className="tabular">{row.original.is_cash_account ? "—" : row.original.unreconciled_count}</span>
        ),
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }: { row: { original: BankAccountRow } }) => (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-16 text-right" },
        cell: ({ row }: { row: { original: BankAccountRow } }) => (
          <BankAccountRowActions
            businessId={businessId}
            accountId={row.original.id}
            accountName={row.original.name}
            isCashAccount={Boolean(row.original.is_cash_account)}
          />
        ),
      },
    ],
    [businessId, baseCurrency],
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
  const hasActiveFilter = Boolean(query || kindFilter || statusFilter);

  const totalBookBalance = useMemo(() => rows.reduce((sum, r) => sum + Number(r.book_balance_minor || 0), 0), [rows]);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search bank or cash accounts…" ariaLabel="Search bank accounts" />
        <ToolbarSelect
          value={kindFilter}
          onChange={(val) => setFilter("type", val)}
          ariaLabel="Filter by account type"
          options={[
            { value: "", label: "All types" },
            { value: "bank", label: "Bank accounts" },
            { value: "cash", label: "Cash accounts" },
          ]}
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={(val) => setFilter("status", val)}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active only" },
            { value: "inactive", label: "Inactive only" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename={`bank-accounts-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Account", accessorKey: "name" },
              { header: "Type", accessorFn: (r: BankAccountRow) => (r.is_cash_account ? "Cash" : "Bank") },
              { header: "Institution", accessorKey: "bank_name" },
              { header: "Mapped GL", accessorKey: "ledger_name" },
              { header: "Currency", accessorKey: "currency_code" },
              { header: "Book Balance", accessorFn: (r: BankAccountRow) => minorToDecimalString(Number(r.book_balance_minor || 0), r.currency_code || baseCurrency) },
              { header: "Status", accessorFn: (r: BankAccountRow) => (r.is_active ? "Active" : "Inactive") },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {kindFilter && <FilterChip onRemove={() => setFilter("type", "")}>Type: {kindFilter === "cash" ? "Cash" : "Bank"}</FilterChip>}
          {statusFilter && <FilterChip onRemove={() => setFilter("status", "")}>Status: {statusFilter === "active" ? "Active only" : "Inactive only"}</FilterChip>}
          {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-table-xl"
          noResultsMessage="No accounts match"
          onClearFilters={clearFilters}
          getRowHref={(row: BankAccountRow) => `/b/${businessId}/banking/accounts/${row.id}`}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={accounts.length}
            itemLabel="accounts"
            metrics={[{ label: "Total Book Balance", value: formatMoney(totalBookBalance, baseCurrency), tone: "primary" }]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
