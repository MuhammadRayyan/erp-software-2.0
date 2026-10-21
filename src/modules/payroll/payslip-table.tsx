"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Play, MoreHorizontal, ChevronRight, Eye, FileEdit } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/ui/data-table";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { useColumns } from "@/components/columns-dropdown";
import { type ColumnVisibility } from "@/components/use-column-visibility";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { formatDate, formatMoney } from "@/core/format";
import { type PayslipRecord } from "@/modules/payroll/services/payroll-service";

interface PayslipTableProps {
  businessId: string;
  payslips: PayslipRecord[];
  currency?: string;
  serverSnapshot?: ColumnVisibility;
  onOpenPayRun: () => void;
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
  onOpenPayRun,
}: PayslipTableProps) {
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);

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
      if (statusFilter !== "all" && p.documentStatus !== statusFilter) return false;

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
  }, [payslips, query, statusFilter]);

  const columns: any[] = useMemo(() => [
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
      meta: { className: "w-16 text-right" },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }: any) => {
        const slip = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label={`Actions for ${slip.payslipNumber}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/b/${businessId}/payroll/payslips/${slip.id}`}>
                    <Eye className="size-4 text-muted-foreground" /> View Details
                  </Link>
                </DropdownMenuItem>
                {slip.documentStatus === "draft" && (
                  <DropdownMenuItem asChild>
                    <Link href={`/b/${businessId}/payroll/payslips/${slip.id}/edit`}>
                      <FileEdit className="size-4 text-muted-foreground" /> Edit Draft
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100"
            >
              <Link href={`/b/${businessId}/payroll/payslips/${slip.id}`} aria-label={`Open ${slip.payslipNumber}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        );
      },
    },
  ], [businessId, currency]);

  const table = useTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
      columnVisibility: colVisibility,
    },
    onSortingChange: setSorting,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
  });

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
  };

  const hasActiveFilter = Boolean(query || statusFilter !== "all");

  const totalGross = useMemo(() => {
    return filteredRows.reduce((sum, p) => sum + (p.grossAmountMinor ?? 0), 0);
  }, [filteredRows]);

  const totalDeductions = useMemo(() => {
    return filteredRows.reduce((sum, p) => sum + (p.deductionsMinor ?? 0), 0);
  }, [filteredRows]);

  const totalNet = useMemo(() => {
    return filteredRows.reduce((sum, p) => sum + (p.netAmountMinor ?? 0), 0);
  }, [filteredRows]);

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search payslip #, employee, period..."
          ariaLabel="Search payslips"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter by status"
          options={[
            { value: "all", label: "All Statuses" },
            { value: "posted", label: "Posted Only" },
            { value: "draft", label: "Draft Only" },
            { value: "void", label: "Void Only" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
          <Button
            variant="secondary"
            onClick={onOpenPayRun}
            className="h-9"
          >
            <Play className="size-3.5 mr-1.5 text-primary" /> Generate Pay Run
          </Button>
          <Button asChild className="h-9">
            <Link href={`/b/${businessId}/payroll/payslips/new`}>
              <Plus className="size-4 mr-1.5" /> New Payslip
            </Link>
          </Button>
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {statusFilter !== "all" && (
            <FilterChip onRemove={() => setStatusFilter("all")}>
              Status: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
            </FilterChip>
          )}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <DataTable
        table={table}
        density={density}
        minWidth="min-w-[850px]"
        noResultsMessage="No payslips match these filters"
        noResultsSubtext="Create your first payslip or click 'Generate Pay Run'."
        onClearFilters={clearFilters}
      />

      {filteredRows.length > 0 && (
        <TableTotalsBar
          filteredCount={filteredRows.length}
          totalCount={payslips.length}
          itemLabel="payslips"
          metrics={[
            { label: "Total Gross", value: formatMoney(totalGross, currency) },
            { label: "Total Deductions", value: totalDeductions > 0 ? `-${formatMoney(totalDeductions, currency)}` : `0.00 ${currency}` },
            { label: "Net Payable", value: formatMoney(totalNet, currency), tone: "primary" },
          ]}
        />
      )}
    </>
  );
}
