"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MoreHorizontal, FileEdit, Download, FileText, PackageCheck } from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect, DateRangeFilter, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { ClientListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { formatDate, formatMoney, minorToDecimalString, getBusinessTodayIso } from "@/core/format";
import type { SalesOrderStatus } from "./sales-order-service";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";

type Row = {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  date: string;
  expected_date: string | null;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  documentStatus: SalesOrderStatus;
  projectIds: string[];
  projectNames: string[];
  businessId: string; // Passed in mapped data for links
};

const COLUMN_LABELS: Record<string, string> = {
  expected_date: "Expected",
  total_minor: "Total",
  documentStatus: "Status",
};

export function SalesOrderTable({
  businessId,
  orders,
  serverSnapshot,
}: {
  businessId: string;
  orders: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const canEditPerm = useActionPermission("edit");
  const canExportPerm = useActionPermission("export");
  const canCreatePerm = useActionPermission("create");
  const canCreateInventoryPerm = useActionPermission("create", "inventory");

  const {
    query,
    status,
    customerId,
    projectId,
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

  const customerOptions = useMemo(
    () =>
      Array.from(new Map(orders.map((order) => [order.customer_id, order.customer_name])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [orders],
  );
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          orders.flatMap((order) => order.projectIds.map((id, index) => [id, order.projectNames[index] ?? id] as const)),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [orders],
  );

  const initialColumns = useMemo(
    () => ({ expected_date: true, total_minor: true, documentStatus: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "sales-orders",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(
    () =>
      orders
        .filter((order) => {
          const matchesQuery = `${order.order_number} ${order.customer_name}`.toLowerCase().includes(query.trim().toLowerCase());
          return (
            (!status || order.documentStatus === status) &&
            (!customerId || order.customer_id === customerId) &&
            (!projectId || order.projectIds.includes(projectId)) &&
            (!fromDate || order.date >= fromDate) &&
            (!toDate || order.date <= toDate) &&
            matchesQuery
          );
        })
        .map((order) => ({ ...order, businessId })),
    [orders, projectId, query, status, customerId, fromDate, toDate, businessId],
  );

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "order_number",
        header: "Order",
        cell: ({ row }: any) => (
          <Link
            href={`/b/${row.original.businessId}/sales/orders/${row.original.id}`}
            className="tabular font-medium text-primary hover:underline"
          >
            {row.original.order_number}
          </Link>
        ),
      },
      {
        accessorKey: "customer_name",
        header: "Customer",
        meta: { wrap: true },
      },
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }: any) => formatDate(row.original.date),
      },
      {
        accessorKey: "expected_date",
        header: "Expected",
        cell: ({ row }: any) => row.original.expected_date ? formatDate(row.original.expected_date) : "—",
      },
      {
        accessorKey: "total_minor",
        header: "Total",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money">
            {formatMoney(row.original.total_minor, row.original.currency_code, row.original.currency_minor_unit)}
          </span>
        ),
      },
      {
        accessorKey: "documentStatus",
        header: "Status",
        cell: ({ row }: any) => <StatusBadge status={row.original.documentStatus} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const order = row.original;
          const canEdit = order.documentStatus !== "completed" && order.documentStatus !== "cancelled" && order.documentStatus !== "superseded";
          const canInvoice = order.documentStatus === "active";
          const hasUpper = (canEdit && canEditPerm) || canExportPerm;
          const hasLower = canInvoice && (canCreatePerm || canCreateInventoryPerm);
          if (!hasUpper && !hasLower) return null;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${order.order_number}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {canEdit && (
                    <DropdownMenuItem permission="edit" asChild>
                      <Link href={`/b/${order.businessId}/sales/orders/${order.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Order
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem permission="export" asChild>
                    <a href={`/api/businesses/${order.businessId}/documents/sales-order/${order.id}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-4 text-muted-foreground" /> Download PDF
                    </a>
                  </DropdownMenuItem>
                  {canInvoice && (
                    <>
                      {hasUpper && hasLower && <DropdownMenuSeparator />}
                      <DropdownMenuItem permission="create" asChild>
                        <Link href={`/b/${order.businessId}/sales/invoices/new?orderId=${order.id}`}>
                          <FileText className="size-4 text-muted-foreground" /> Create Invoice
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem permission="create" permissionModule="inventory" asChild>
                        <Link href={`/b/${order.businessId}/sales/delivery-notes/new?orderId=${order.id}`}>
                          <PackageCheck className="size-4 text-muted-foreground" /> Create Delivery Note
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canCreatePerm, canCreateInventoryPerm, canEditPerm, canExportPerm],
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
  const hasActiveFilter = Boolean(customerId || projectId || fromDate || toDate || status || query);

  const totalOrderValueStr = useMemo(() => {
    const activeRows = status === "cancelled" ? rows : rows.filter((r) => r.documentStatus !== "cancelled" && r.documentStatus !== "superseded");
    return renderMultiCurrencyString(
      activeRows.map((r) => ({
        amount: r.total_minor,
        currency: r.currency_code,
        minorUnit: r.currency_minor_unit,
      }))
    );
  }, [rows, status]);
  const activeCount = useMemo(
    () => rows.filter((r) => r.documentStatus === "active" || r.documentStatus === "draft").length,
    [rows]
  );

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search sales orders…" ariaLabel="Search sales orders" />
        <ToolbarSelect
          value={customerId}
          onChange={(val) => setFilter("customerId", val)}
          ariaLabel="Filter by customer"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={projectId}
          onChange={(val) => setFilter("projectId", val)}
          ariaLabel="Filter by project"
          className="min-w-36 max-w-52"
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <DateRangeFilter
          fromDate={fromDate}
          toDate={toDate}
          onFromChange={(val) => setFilter("from", val)}
          onToChange={(val) => setFilter("to", val)}
          fromAriaLabel="Order date from"
          toAriaLabel="Order date to"
        />
        <ToolbarSelect
          value={status}
          onChange={(val) => setFilter("status", val)}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <ExportCsvButton
            size="sm"
            filename={`sales-orders-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Order Number", accessorKey: "order_number" },
              { header: "Customer", accessorKey: "customer_name" },
              { header: "Date", accessorKey: "date" },
              { header: "Expected Date", accessorKey: "expected_date" },
              { header: "Currency", accessorKey: "currency_code" },
              { header: "Total", accessorFn: (r: any) => minorToDecimalString(r.total_minor, r.currency_code, r.currency_minor_unit) },
              { header: "Status", accessorKey: "documentStatus" },
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
          {projectId && (
            <FilterChip onRemove={() => setFilter("projectId", "")}>
              Project: {projectOptions.find(([id]) => id === projectId)?.[1]}
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
          minWidth="min-w-[780px]" 
          noResultsMessage="No sales orders match" 
          onClearFilters={clearFilters}
          getRowHref={(row: Row) => `/b/${row.businessId}/sales/orders/${row.id}`}
        />

        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={orders.length}
            itemLabel="orders"
            metrics={[
              { label: "Total Order Value", value: totalOrderValueStr, tone: "primary" },
              { label: "Active Orders", value: `${activeCount} orders` },
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
