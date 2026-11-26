"use client";

import { useMemo } from "react";
import { MoreHorizontal, FileEdit, CheckCircle2, Ban } from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";

interface EmployeeTableProps {
  businessId: string;
  employees: EmployeeRecord[];
  currency?: string;
  serverSnapshot?: ColumnVisibility;
  onEditEmployee: (employee: EmployeeRecord) => void;
  onToggleActive: (employee: EmployeeRecord) => void;
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
}: EmployeeTableProps) {
  const { density } = useTableDensity(businessId);
  const canEdit = useActionPermission("edit");
  const {
    query,
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
      meta: { className: "w-12 text-right" },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }: any) => {
        if (!canEdit) return null;
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
                <DropdownMenuItem permission="edit" onClick={() => onEditEmployee(emp)}>
                  <FileEdit className="size-4 text-muted-foreground" /> Edit Employee
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem permission="edit" onClick={() => onToggleActive(emp)}>
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
          </div>
        );
      },
    },
  ], [canEdit, currency, onEditEmployee, onToggleActive]);

  const { pagination, paginationInfo } = buildPagination(filteredRows.length);

  const table = useTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
      pagination,
      columnVisibility: colVisibility,
    },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = resetFilters;

  const hasActiveFilter = Boolean(query || statusFilter);

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
          onChange={(val) => setFilter("q", val)}
          placeholder="Search by name, code, designation..."
          ariaLabel="Search employees"
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
            filename={`employees-${getBusinessTodayIso()}.csv`}
            data={filteredRows}
            columns={[
              { header: "Code", accessorKey: "code" },
              { header: "Name", accessorKey: "name" },
              { header: "Designation", accessorKey: "designation" },
              { header: "Department", accessorKey: "department" },
              { header: "Basic Salary", accessorFn: (r: EmployeeRecord) => minorToDecimalString(Number(r.basicSalaryMinor || 0), currency) },
              { header: "Status", accessorFn: (r: EmployeeRecord) => (r.isActive ? "Active" : "Inactive") },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>

      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {statusFilter && (
            <FilterChip onRemove={() => setFilter("status", "")}>
              Status: {statusFilter === "active" ? "Active only" : "Inactive only"}
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
          minWidth="min-w-table-xl"
          noResultsMessage="No employees found matching your criteria"
          noResultsSubtext="Try adjusting your search query or status filter."
          onClearFilters={clearFilters}
          onRowClick={canEdit ? (row: EmployeeRecord) => onEditEmployee(row) : undefined}
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
        <ClientListPagination
          info={paginationInfo}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ListTableCard>
    </>
  );
}
