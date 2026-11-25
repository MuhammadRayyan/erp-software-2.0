"use client";

import { useMemo, useState } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { BatchDocumentActions } from "@/components/batch/batch-document-actions";
import { selectionColumn } from "@/components/batch/selection-column";
import { batchPostPayslipsAction, batchVoidPayslipsAction } from "@/modules/payroll/actions/payroll-actions";
import Link from "next/link";
import { FileEdit } from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, DateRangeFilter, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { ClientListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { useColumns } from "@/components/columns-dropdown";
import { type ColumnVisibility } from "@/components/use-column-visibility";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { formatDate, formatMoney, getBusinessTodayIso, minorToDecimalString } from "@/core/format";
import { type PayslipRecord } from "@/modules/payroll/services/payroll-service";

interface PayslipTableProps {
  businessId: string;
  payslips: PayslipRecord[];
  currency?: string;
  serverSnapshot?: ColumnVisibility;
}

const columnLabels: Record<string, string> = {
  employeeName: "Employee",
  date: "Date & Period",
  grossAmountMinor: "Gross",
  deductionsMinor: "Deductions",
  netAmountMinor: "Net Pay",
  documentStatus: "Status",
};

export function PayslipTable({
  businessId,
  payslips,
  currency = "AED",
  serverSnapshot,
}: PayslipTableProps) {
  const { density } = useTableDensity(businessId);
  const canEdit = useActionPermission("edit");
  const {
    query,
    status: statusFilter,
    fromDate,
    toDate,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState({ defaultSort: "date", defaultDir: "desc" });

  const initialColumns = useMemo(
    () => ({
      employeeName: true,
      date: true,
      grossAmountMinor: true,
      deductionsMinor: true,
      netAmountMinor: true,
      documentStatus: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "payroll-payslips",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: columnLabels,
  });

  const filteredRows = useMemo(() => {
    return payslips.filter((p) => {
      if (statusFilter && p.documentStatus !== statusFilter) return false;
      if (fromDate && p.date < fromDate) return false;
      if (toDate && p.date > toDate) return false;

      if (!query.trim()) return true;
      const term = query.toLowerCase().trim();
      return (
        p.payslipNumber.toLowerCase().includes(term) ||
        (p.employeeName && p.employeeName.toLowerCase().includes(term)) ||
        (p.periodDescription && p.periodDescription.toLowerCase().includes(term)) ||
        (p.employeeDesignation && p.employeeDesignation.toLowerCase().includes(term)) ||
        (p.employeeDepartment && p.employeeDepartment.toLowerCase().includes(term))
      );
    });
  }, [payslips, query, statusFilter, fromDate, toDate]);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const exportColumns = useMemo(() => [
    { header: "Payslip #", accessorKey: "payslipNumber" as const },
    { header: "Employee", accessorKey: "employeeName" as const },
    { header: "Date", accessorKey: "date" as const },
    { header: "Gross", accessorFn: (r: PayslipRecord) => minorToDecimalString(Number(r.grossAmountMinor || 0), currency) },
    { header: "Deductions", accessorFn: (r: PayslipRecord) => minorToDecimalString(Number(r.deductionsMinor || 0), currency) },
    { header: "Net Pay", accessorFn: (r: PayslipRecord) => minorToDecimalString(Number(r.netAmountMinor || 0), currency) },
    { header: "Status", accessorKey: "documentStatus" as const },
  ], [currency]);

  const columns: any[] = useMemo(() => [
    selectionColumn<PayslipRecord>((slip) => `payslip ${slip.payslipNumber}`),
    {
      accessorKey: "payslipNumber",
      header: "Payslip #",
      cell: ({ row }: any) => {
        const slip = row.original;
        return (
          <Link
            href={`/b/${businessId}/payroll/payslips/${slip.id}`}
            className="tabular font-medium text-primary hover:underline block"
          >
            {slip.payslipNumber}
          </Link>
        );
      },
    },
    {
      accessorKey: "employeeName",
      header: "Employee",
      meta: { wrap: true },
      cell: ({ row }: any) => {
        const slip = row.original;
        return (
          <div>
            <div className="font-medium text-foreground">{slip.employeeName || "Employee"}</div>
            <div className="text-xs text-muted-foreground">
              {slip.employeeDesignation || slip.employeeDepartment || "—"}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "date",
      header: "Date & Period",
      meta: { wrap: true },
      cell: ({ row }: any) => {
        const slip = row.original;
        return (
          <div>
            <div className="tabular text-foreground">{formatDate(slip.date)}</div>
            <div className="text-xs text-muted-foreground">{slip.periodDescription || "—"}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "grossAmountMinor",
      header: "Gross",
      meta: { numeric: true },
      cell: ({ row }: any) => (
        <span className="money font-medium">{formatMoney(row.original.grossAmountMinor, currency)}</span>
      ),
    },
    {
      accessorKey: "deductionsMinor",
      header: "Deductions",
      meta: { numeric: true },
      cell: ({ row }: any) => {
        const ded = row.original.deductionsMinor;
        return (
          <span className="money text-muted-foreground">
            {ded > 0 ? `-${formatMoney(ded, currency)}` : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "netAmountMinor",
      header: "Net Pay",
      meta: { numeric: true },
      cell: ({ row }: any) => (
        <span className="money font-medium text-foreground">
          {formatMoney(row.original.netAmountMinor, currency)}
        </span>
      ),
    },
    {
      accessorKey: "documentStatus",
      header: "Status",
      cell: ({ row }: any) => (
        <StatusBadge status={row.original.documentStatus} />
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-12 text-right" },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }: any) => {
        const slip = row.original;
        if (slip.documentStatus !== "draft" || !canEdit) return null;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              permission="edit"
              asChild
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
            >
              <Link href={`/b/${businessId}/payroll/payslips/${slip.id}/edit`} aria-label={`Edit ${slip.payslipNumber}`}>
                <FileEdit className="size-4" />
              </Link>
            </Button>
          </div>
        );
      },
    },
  ], [businessId, canEdit, currency]);

  const { pagination, paginationInfo } = buildPagination(filteredRows.length);

  const table = useTable({
    data: filteredRows,
    columns,
    getRowId: (row: PayslipRecord) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      pagination,
      columnVisibility: colVisibility,
      rowSelection,
    },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = resetFilters;

  const hasActiveFilter = Boolean(query || statusFilter || fromDate || toDate);

  const totalGross = useMemo(() => {
    return filteredRows.filter((p) => p.documentStatus !== "void").reduce((sum, p) => sum + (p.grossAmountMinor ?? 0), 0);
  }, [filteredRows]);

  const totalDeductions = useMemo(() => {
    return filteredRows.filter((p) => p.documentStatus !== "void").reduce((sum, p) => sum + (p.deductionsMinor ?? 0), 0);
  }, [filteredRows]);

  const totalNet = useMemo(() => {
    return filteredRows.filter((p) => p.documentStatus !== "void").reduce((sum, p) => sum + (p.netAmountMinor ?? 0), 0);
  }, [filteredRows]);

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={(val) => setFilter("q", val)}
          placeholder="Search payslip #, employee, period..."
          ariaLabel="Search payslips"
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(val) => setFilter("from", val)}
          onToChange={(val) => setFilter("to", val)}
          fromAriaLabel="Payslip date from"
          toAriaLabel="Payslip date to"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={(val) => setFilter("status", val)}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "posted", label: "Posted" },
            { value: "draft", label: "Draft" },
            { value: "void", label: "Void" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename={`payslips-${getBusinessTodayIso()}.csv`}
            data={filteredRows}
            columns={exportColumns}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {fromDate && <FilterChip onRemove={() => setFilter("from", "")}>From: {formatDate(fromDate)}</FilterChip>}
          {toDate && <FilterChip onRemove={() => setFilter("to", "")}>To: {formatDate(toDate)}</FilterChip>}
          {statusFilter && (
            <FilterChip onRemove={() => setFilter("status", "")}>
              Status: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
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
          minWidth="min-w-[850px]"
          noResultsMessage="No payslips match these filters"
          noResultsSubtext="Create your first payslip or click 'Generate Pay Run'."
          onClearFilters={clearFilters}
          getRowHref={(row: PayslipRecord) => `/b/${businessId}/payroll/payslips/${row.id}`}
        />

        {filteredRows.length > 0 && (
          <TableTotalsBar
            filteredCount={filteredRows.length}
            totalCount={payslips.length}
            itemLabel="payslips"
            metrics={[
              { label: "Total Gross", value: formatMoney(totalGross, currency) },
              { label: "Total Deductions", value: totalDeductions > 0 ? `-${formatMoney(totalDeductions, currency)}` : formatMoney(0, currency) },
              { label: "Net Payable", value: formatMoney(totalNet, currency), tone: "primary" },
            ]}
          />
        )}
        <ClientListPagination
          info={paginationInfo}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ListTableCard>
      <BatchDocumentActions
        selected={filteredRows.filter((row) => rowSelection[row.id])}
        totalCount={filteredRows.length}
        noun={{ one: "payslip", many: "payslips" }}
        statusOf={(row) => row.documentStatus}
        onClear={() => setRowSelection({})}
        onSelectAll={() => table.toggleAllRowsSelected(true)}
        exportConfig={{ filename: "payslips", columns: exportColumns }}
        post={{ label: "Post drafts", action: (ids) => batchPostPayslipsAction(businessId, ids) }}
        voidAction={{
          action: (ids) => batchVoidPayslipsAction(businessId, ids),
          description: "Each posted payslip's journal is reversed. Payslips already included in a paid WPS run should be corrected with a new payslip instead.",
        }}
      />
    </>
  );
}
