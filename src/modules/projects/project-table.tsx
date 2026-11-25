"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MoreHorizontal, FileEdit, ReceiptText, FileInput, BarChart3 } from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { ListToolbar, SearchInput, ToolbarSelect, DateRangeFilter, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { ClientListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { formatDate, formatMoney, getBusinessTodayIso, minorToDecimalString } from "@/core/format";
import type { ProjectListRow } from "./project-service";
import { ProjectStatusBadge } from "./project-status";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";

const COLUMN_LABELS: Record<string, string> = {
  customerName: "Customer",
  status: "Status",
  revenueMinor: "Revenue",
  costMinor: "Cost",
  profitMinor: "Profit",
};

export function ProjectTable({ 
  businessId, 
  currency, 
  projects,
  serverSnapshot,
}: { 
  businessId: string; 
  currency: string; 
  projects: ProjectListRow[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const canEditProject = useActionPermission("edit", "projects");
  const canCreateSales = useActionPermission("create", "sales");
  const canCreatePurchases = useActionPermission("create", "purchases");
  const canViewReports = useActionPermission("view", "reports");

  const {
    query,
    status,
    customerId,
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

  const customerOptions = useMemo(() => Array.from(new Map(projects.flatMap((project) => project.customerId && project.customerName ? [[project.customerId, project.customerName] as const] : [])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [projects]);

  const initialColumns = useMemo(
    () => ({ customerName: true, status: true, revenueMinor: true, costMinor: true, profitMinor: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "projects",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => projects.filter((project) => {
    const text = `${project.code} ${project.name} ${project.customerName ?? ""} ${project.coClientNames ?? ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (!status || project.status === status) && (!customerId || project.customerId === customerId) && (!fromDate || (project.startDate ?? "") >= fromDate) && (!toDate || (project.targetEndDate ?? "9999-12-31") <= toDate);
  }).map((project) => ({ ...project, businessId, currency })), [customerId, fromDate, projects, query, status, toDate, businessId, currency]);
  
  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "code",
        header: "Project",
        cell: ({ row }: any) => (
          <Link href={`/b/${row.original.businessId}/projects/${row.original.id}`} className="font-medium text-primary hover:underline">
            <span className="tabular">{row.original.code}</span>
            <span className="ml-2 text-foreground">{row.original.name}</span>
          </Link>
        ),
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ row }: any) => {
          const name = row.original.customerName;
          const coCount = row.original.coClientCount || 0;
          const coNames = row.original.coClientNames;
          if (!name && coCount === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>{name ?? "Multiple Clients"}</span>
              {coCount > 0 && (
                <span
                  title={coNames ? `Co-clients: ${coNames}` : `${coCount} co-clients`}
                  className="inline-flex items-center rounded-full bg-surface-raised px-1.5 py-0.2 text-[11px] font-medium text-muted-foreground border border-border cursor-help"
                >
                  +{coCount}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: any) => <ProjectStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "revenueMinor",
        header: "Revenue",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {formatMoney(row.original.revenueMinor, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "costMinor",
        header: "Cost",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {formatMoney(row.original.costMinor, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "profitMinor",
        header: "Profit",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className={`money text-right font-medium ${row.original.profitMinor < 0 ? "text-danger" : ""}`}>
            {formatMoney(row.original.profitMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const prj = row.original;
          const hasSecondaryActions = canCreateSales || canCreatePurchases || canViewReports;
          if (!canEditProject && !hasSecondaryActions) return null;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${prj.code}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem permission="edit" asChild>
                    <Link href={`/b/${prj.businessId}/projects/${prj.id}/edit`}>
                      <FileEdit className="size-4 text-muted-foreground" /> Edit Project
                    </Link>
                  </DropdownMenuItem>
                  {canEditProject && hasSecondaryActions && <DropdownMenuSeparator />}
                  {canCreateSales && (
                    <DropdownMenuItem permission="create" permissionModule="sales" asChild>
                      <Link href={`/b/${prj.businessId}/sales/invoices/new?projectId=${prj.id}`}>
                        <ReceiptText className="size-4 text-muted-foreground" /> New Invoice
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {canCreatePurchases && (
                    <DropdownMenuItem permission="create" permissionModule="purchases" asChild>
                      <Link href={`/b/${prj.businessId}/purchases/invoices/new?projectId=${prj.id}`}>
                        <FileInput className="size-4 text-muted-foreground" /> New Bill
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem permission="view" permissionModule="reports" asChild>
                    <Link href={`/b/${prj.businessId}/reports/project-profitability?projectId=${prj.id}`}>
                      <BarChart3 className="size-4 text-muted-foreground" /> Profitability Report
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canCreatePurchases, canCreateSales, canEditProject, canViewReports],
  );

  const { pagination, paginationInfo } = buildPagination(rows.length);

  const table = useTable({
    data: rows,
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
  const hasActiveFilter = Boolean(customerId || status || query || fromDate || toDate);
  const statusLabel = (s: string) => s === "draft" ? "Draft" : s === "active" ? "Active" : s === "on_hold" ? "On Hold" : s === "completed" ? "Completed" : s === "cancelled" ? "Cancelled" : s;

  const totalRevenue = useMemo(() => rows.reduce((sum, r) => sum + (r.revenueMinor ?? 0), 0), [rows]);
  const totalCost = useMemo(() => rows.reduce((sum, r) => sum + (r.costMinor ?? 0), 0), [rows]);
  const totalProfit = totalRevenue - totalCost;

  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search projects…" ariaLabel="Search projects" />
      <ToolbarSelect
        value={customerId}
        onChange={(val) => setFilter("customerId", val)}
        ariaLabel="Filter by customer"
        className="min-w-36 max-w-52"
        options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]}
      />
      <DateRangeFilter
        fromDate={fromDate}
        toDate={toDate}
        onFromChange={(val) => setFilter("from", val)}
        onToChange={(val) => setFilter("to", val)}
        fromAriaLabel="Project start date from"
        toAriaLabel="Project target end date to"
      />
      <ToolbarSelect
        value={status}
        onChange={(val) => setFilter("status", val)}
        ariaLabel="Filter by project status"
        className="min-w-32 max-w-44"
        options={[
          { value: "", label: "All statuses" },
          { value: "draft", label: "Draft" },
          { value: "active", label: "Active" },
          { value: "on_hold", label: "On Hold" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <ExportCsvButton
          size="sm"
          filename={`projects-${getBusinessTodayIso()}.csv`}
          data={rows}
          columns={[
            { header: "Code", accessorKey: "code" },
            { header: "Name", accessorKey: "name" },
            { header: "Customer", accessorKey: "customerName" },
            { header: "Status", accessorKey: "status" },
            { header: "Revenue", accessorFn: (r: any) => minorToDecimalString(Number(r.revenueMinor || 0), currency) },
            { header: "Cost", accessorFn: (r: any) => minorToDecimalString(Number(r.costMinor || 0), currency) },
            { header: "Profit", accessorFn: (r: any) => minorToDecimalString(Number(r.profitMinor || 0), currency) },
          ]}
        />
        <DensityToggle businessId={businessId} />
        {dropdown}
      </div>
    </ListToolbar>
    {hasActiveFilter && (
      <ActiveFiltersRow onClearAll={clearFilters}>
        {customerId && (
          <FilterChip onRemove={() => setFilter("customerId", "")}>
            Customer: {customerOptions.find(([id]) => id === customerId)?.[1]}
          </FilterChip>
        )}
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
        minWidth="min-w-[860px]" 
        noResultsMessage="No projects match these filters" 
        onClearFilters={clearFilters}
        getRowHref={(row: any) => `/b/${row.businessId}/projects/${row.id}`}
      />
      {rows.length > 0 && (
        <TableTotalsBar
          filteredCount={rows.length}
          totalCount={projects.length}
          itemLabel="projects"
          metrics={[
            { label: "Revenue", value: formatMoney(totalRevenue, currency) },
            { label: "Cost", value: formatMoney(totalCost, currency) },
            { label: "Net Profit", value: formatMoney(totalProfit, currency), tone: totalProfit < 0 ? "danger" : "primary" },
          ]}
        />
      )}
      <ClientListPagination
        info={paginationInfo}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </ListTableCard>
  </>;
}
