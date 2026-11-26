"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { debounce, useQueryStates } from "nuqs";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
} from "@tanstack/react-table/legacy";
import type { RowSelectionState } from "@tanstack/react-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  ActiveFiltersRow,
  DateRangeFilter,
  FilterChip,
  ListToolbar,
  SearchInput,
  StatusFilterSelect,
} from "@/components/list-toolbar";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatDate, formatMoney } from "@/core/format";
import type { CsvColumn } from "@/lib/export-csv";
import {
  cashDocumentListParsers,
  resolveNextSortFromUpdater,
  toSortingState,
} from "@/lib/list-query-params";
import type { CashDocumentListSummary } from "@/modules/shared/list-query-helpers";
import type { BatchActionResult } from "@/modules/shared/batch";
import { BatchDocumentActions } from "@/components/batch/batch-document-actions";
import { selectionColumn } from "@/components/batch/selection-column";
import type { BatchNoun } from "@/components/batch/use-batch-runner";

export type CashDocumentBatchConfig<TRow> = {
  noun: BatchNoun;
  statusOf: (row: TRow) => string;
  labelOf: (row: TRow) => string;
  voidAction: (ids: string[]) => Promise<BatchActionResult>;
  voidDescription: string;
  deleteDrafts: (ids: string[]) => Promise<BatchActionResult>;
};

const CASH_DOC_STATUS_LABELS: Record<string, string> = {
  posted: "Posted",
  pending_approval: "Pending Approval",
  draft: "Draft",
  void: "Void",
};

const CASH_DOC_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "posted", label: "Posted" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "draft", label: "Draft" },
  { value: "void", label: "Void" },
];

/**
 * Shared client DataTable shell for Receipts and Supplier Payments.
 * Binds `nuqs` URL query state (`q`, `status`, `from`, `to`, `sort`, `dir`, `page`)
 * to server-paginated queries and renders consistent toolbars and DB-wide totals.
 */
export function CashDocumentTable<TRow extends { id: string }>({
  businessId,
  baseCurrency,
  rows,
  columns,
  summary,
  storageKey,
  initialColumnVisibility,
  columnLabels,
  serverSnapshot,
  searchPlaceholder,
  searchAriaLabel,
  filterAriaLabel,
  fromAriaLabel,
  toAriaLabel,
  itemLabel,
  noResultsMessage,
  noResultsSubtext,
  minWidth = "min-w-table-2xl",
  getRowHref,
  exportConfig,
  footer,
  batch,
}: {
  businessId: string;
  baseCurrency: string;
  rows: TRow[];
  columns: any[];
  summary: CashDocumentListSummary;
  storageKey: string;
  initialColumnVisibility: Record<string, boolean>;
  columnLabels: Record<string, string>;
  serverSnapshot?: ColumnVisibility;
  searchPlaceholder: string;
  searchAriaLabel: string;
  filterAriaLabel: string;
  fromAriaLabel: string;
  toAriaLabel: string;
  itemLabel: string;
  noResultsMessage: string;
  noResultsSubtext: string;
  minWidth?: string;
  getRowHref?: (row: TRow) => string | undefined | null;
  exportConfig?: {
    filename: string;
    columns: CsvColumn<TRow>[];
  };
  footer?: ReactNode;
  /** Enables row selection with export, void and delete-draft bulk actions. */
  batch?: CashDocumentBatchConfig<TRow>;
}) {
  const { density } = useTableDensity(businessId);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const tableColumns = useMemo(
    () => (batch ? [selectionColumn<TRow>(batch.labelOf), ...columns] : columns),
    [batch, columns],
  );
  const [, startTransition] = useTransition();
  const [urlState, setUrlState] = useQueryStates(cashDocumentListParsers, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const query = urlState.q;
  const statusFilter = urlState.status;
  const fromDate = urlState.from;
  const toDate = urlState.to;
  const sorting = useMemo(
    () => toSortingState(urlState.sort, urlState.dir),
    [urlState.sort, urlState.dir],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey,
    businessId,
    serverSnapshot,
    initial: initialColumnVisibility,
    labels: columnLabels,
  });

  const table = useTable({
    data: rows,
    columns: tableColumns,
    manualSorting: true,
    getRowId: (row: TRow) => row.id,
    enableRowSelection: Boolean(batch),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnVisibility: colVisibility,
      rowSelection,
    },
    onSortingChange: (updater) => {
      const next = resolveNextSortFromUpdater(updater, urlState.sort, urlState.dir, "desc");
      void setUrlState({ sort: next.sort, dir: next.dir, page: 1 });
    },
    getCoreRowModel: createCoreRowModel(),
  });

  const clearFilters = () => {
    void setUrlState({ q: "", status: "", from: "", to: "", page: 1 });
  };
  const hasActiveFilter = Boolean(query || statusFilter || fromDate || toDate);

  const totalAmountStr = useMemo(
    () =>
      renderMultiCurrencyString(
        summary.currencyTotals.map((c) => ({
          amount: c.amountMinor,
          currency: c.currencyCode,
          minorUnit: c.currencyMinorUnit,
        })),
      ),
    [summary.currencyTotals],
  );

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={(value) => {
            void setUrlState({ q: value, page: 1 }, { limitUrlUpdates: value ? debounce(250) : undefined });
          }}
          placeholder={searchPlaceholder}
          ariaLabel={searchAriaLabel}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(value) => void setUrlState({ from: value, page: 1 })}
          onToChange={(value) => void setUrlState({ to: value, page: 1 })}
          onClear={() => void setUrlState({ from: "", to: "", page: 1 })}
          fromAriaLabel={fromAriaLabel}
          toAriaLabel={toAriaLabel}
        />
        <StatusFilterSelect
          value={statusFilter}
          onChange={(value) => void setUrlState({ status: value, page: 1 })}
          ariaLabel={filterAriaLabel}
          options={CASH_DOC_STATUS_OPTIONS}
        />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {exportConfig && (
            <ExportCsvButton
              size="sm"
              filename={exportConfig.filename}
              columns={exportConfig.columns as CsvColumn<Record<string, any>>[]}
              data={rows as Record<string, any>[]}
              totalCount={summary.filteredTotal}
            />
          )}
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {fromDate && (
            <FilterChip onRemove={() => void setUrlState({ from: "", page: 1 })}>
              From: {formatDate(fromDate)}
            </FilterChip>
          )}
          {toDate && (
            <FilterChip onRemove={() => void setUrlState({ to: "", page: 1 })}>
              To: {formatDate(toDate)}
            </FilterChip>
          )}
          {statusFilter && (
            <FilterChip onRemove={() => void setUrlState({ status: "", page: 1 })}>
              Status: {CASH_DOC_STATUS_LABELS[statusFilter] ?? statusFilter}
            </FilterChip>
          )}
          {query && (
            <FilterChip onRemove={() => void setUrlState({ q: "", page: 1 })}>
              Search: {query}
            </FilterChip>
          )}
        </ActiveFiltersRow>
      )}

      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth={minWidth}
          getRowHref={getRowHref ? (row) => getRowHref(row as TRow) ?? undefined : undefined}
          noResultsMessage={noResultsMessage}
          noResultsSubtext={noResultsSubtext}
          onClearFilters={clearFilters}
        />

        {summary.filteredTotal > 0 && (
          <TableTotalsBar
            filteredCount={summary.filteredTotal}
            totalCount={summary.unfilteredTotal}
            itemLabel={itemLabel}
            metrics={[
              { label: "Total Amount", value: totalAmountStr, tone: "primary" },
              {
                label: "Base Equivalent",
                value: formatMoney(summary.totalBaseAmountMinor, baseCurrency),
                tone: "default",
              },
              ...(summary.postedCount > 0
                ? [{ label: "Posted", value: String(summary.postedCount), tone: "default" as const }]
                : []),
            ]}
          />
        )}
        {footer}
      </ListTableCard>
      {batch ? (
        <BatchDocumentActions
          selected={rows.filter((row) => rowSelection[row.id])}
          totalCount={rows.length}
          noun={batch.noun}
          statusOf={batch.statusOf}
          onClear={() => setRowSelection({})}
          onSelectAll={() => table.toggleAllRowsSelected(true)}
          exportConfig={exportConfig}
          voidAction={{ action: batch.voidAction, description: batch.voidDescription }}
          deleteDrafts={batch.deleteDrafts}
        />
      ) : null}
    </>
  );
}
