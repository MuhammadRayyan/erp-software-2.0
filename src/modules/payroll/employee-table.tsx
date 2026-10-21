"use client";

import { useMemo, useState } from "react";
import { Plus, MoreHorizontal, ChevronRight, FileEdit, CheckCircle2, Ban } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/ui/data-table";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { useColumns } from "@/components/columns-dropdown";
import { type ColumnVisibility } from "@/components/use-column-visibility";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { formatDate, formatMoney } from "@/core/format";
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";

interface EmployeeTableProps {
  businessId: string;
  employees: EmployeeRecord[];
  currency?: string;
  serverSnapshot?: ColumnVisibility;
  onEditEmployee: (employee: EmployeeRecord) => void;
  onToggleActive: (employee: EmployeeRecord) => void;
  onNewEmployee: () => void;
}

const columnLabels: Record<string, string> = {
  designation: "Designation & Dept",
  joiningDate: "Joining Date",
  basicSalaryMinor: "Basic Salary",
  totalStandard: "Total Standard Pay",
  isActive: "Status",
};

export function EmployeeTable({
  businessId,
  employees,
  currency = "AED",
  serverSnapshot,
  onEditEmployee,
  onToggleActive,
  onNewEmployee,
}: EmployeeTableProps) {
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);

  const initialColumns = useMemo(
    () => ({
      designation: true,
      joiningDate: true,
      basicSalaryMinor: true,
      totalStandard: true,
      isActive: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "payroll-employees",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: columnLabels,
  });

  const filteredRows = useMemo(() => {
    return employees.filter((emp) => {
      if (statusFilter === "active" && !emp.isActive) return false;
      if (statusFilter === "inactive" && emp.isActive) return false;

      if (!query.trim()) return true;
      const term = query.toLowerCase().trim();
      return (
        emp.name.toLowerCase().includes(term) ||
        (emp.code && emp.code.toLowerCase().includes(term)) ||
        (emp.designation && emp.designation.toLowerCase().includes(term)) ||
        (emp.department && emp.department.toLowerCase().includes(term)) ||
        (emp.email && emp.email.toLowerCase().includes(term)) ||
        (emp.phone && emp.phone.toLowerCase().includes(term))
      );
    });
  }, [employees, query, statusFilter]);

  const columns: any[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Employee",
      meta: { wrap: true },
      cell: ({ row }: any) => {
        const emp = row.original;
        return (
          <div>
            <button
              type="button"
              onClick={() => onEditEmployee(emp)}
              className="text-left font-medium text-primary hover:underline block"
            >
              {emp.name}
            </button>
            <div className="text-xs text-muted-foreground">
              {emp.code || "No code"} {emp.email ? `• ${emp.email}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "designation",
      header: "Designation & Dept",
      meta: { wrap: true },
      cell: ({ row }: any) => {
        const emp = row.original;
        return (
          <div>
            <div className="text-foreground">{emp.designation || "—"}</div>
            <div className="text-xs text-muted-foreground">{emp.department || "—"}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "joiningDate",
      header: "Joining Date",
      cell: ({ row }: any) => (
        <span className="text-muted-foreground tabular">{formatDate(row.original.joiningDate)}</span>
      ),
    },
    {
      accessorKey: "basicSalaryMinor",
      header: "Basic Salary",
      meta: { numeric: true },
      cell: ({ row }: any) => (
        <span className="money font-medium">{formatMoney(row.original.basicSalaryMinor, currency)}</span>
      ),
    },
    {
      id: "totalStandard",
      header: "Total Standard Pay",
      accessorFn: (emp: EmployeeRecord) =>
        (emp.basicSalaryMinor ?? 0) +
        (emp.housingAllowanceMinor ?? 0) +
        (emp.transportAllowanceMinor ?? 0) +
        (emp.otherAllowancesMinor ?? 0),
      meta: { numeric: true },
      cell: ({ row }: any) => {
        const total =
          (row.original.basicSalaryMinor ?? 0) +
          (row.original.housingAllowanceMinor ?? 0) +
          (row.original.transportAllowanceMinor ?? 0) +
          (row.original.otherAllowancesMinor ?? 0);
        return (
          <span className="money font-medium text-foreground">
            {total > 0 ? formatMoney(total, currency) : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }: any) => (
        <StatusBadge status={row.original.isActive ? "active" : "inactive"} />
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-16 text-right" },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }: any) => {
        const emp = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  aria-label={`Actions for ${emp.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onEditEmployee(emp)}>
                  <FileEdit className="size-4 text-muted-foreground" /> Edit Employee
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onToggleActive(emp)}>
                  {emp.isActive ? (
                    <>
                      <Ban className="size-4 text-danger" />
                      <span className="text-danger">Mark Inactive</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 text-success" />
                      <span className="text-success">Mark Active</span>
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              onClick={() => onEditEmployee(emp)}
              aria-label={`Open ${emp.name}`}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        );
      },
    },
  ], [currency, onEditEmployee, onToggleActive]);

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

  const totalBasic = useMemo(() => {
    return filteredRows.reduce((sum, e) => sum + (e.basicSalaryMinor ?? 0), 0);
  }, [filteredRows]);

  const totalPayroll = useMemo(() => {
    return filteredRows.reduce(
      (sum, e) =>
        sum +
        (e.basicSalaryMinor ?? 0) +
        (e.housingAllowanceMinor ?? 0) +
        (e.transportAllowanceMinor ?? 0) +
        (e.otherAllowancesMinor ?? 0),
      0
    );
  }, [filteredRows]);

  const activeCount = useMemo(() => {
    return filteredRows.filter((e) => e.isActive).length;
  }, [filteredRows]);

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name, code, designation..."
          ariaLabel="Search employees"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter by status"
          options={[
            { value: "all", label: "All Statuses" },
            { value: "active", label: "Active Only" },
            { value: "inactive", label: "Inactive Only" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
          <Button onClick={onNewEmployee} className="h-9">
            <Plus className="size-4 mr-1.5" /> New Employee
          </Button>
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {statusFilter !== "all" && (
            <FilterChip onRemove={() => setStatusFilter("all")}>
              Status: {statusFilter === "active" ? "Active Only" : "Inactive Only"}
            </FilterChip>
          )}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}

      <DataTable
        table={table}
        density={density}
        minWidth="min-w-[850px]"
        noResultsMessage="No employees found matching your criteria"
        noResultsSubtext="Try adjusting your search query or status filter."
        onClearFilters={clearFilters}
      />

      {filteredRows.length > 0 && (
        <TableTotalsBar
          filteredCount={filteredRows.length}
          totalCount={employees.length}
          itemLabel="employees"
          metrics={[
            { label: "Active", value: `${activeCount} active`, tone: "success" },
            { label: "Total Basic", value: formatMoney(totalBasic, currency) },
            { label: "Total Standard Pay", value: formatMoney(totalPayroll, currency), tone: "primary" },
          ]}
        />
      )}
    </>
  );
}
