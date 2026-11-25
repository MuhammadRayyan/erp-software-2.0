"use client";

import { useMemo } from "react";
import Link from "next/link";
import { MoreHorizontal, FileEdit, Download, FileText, PackagePlus } from "lucide-react";
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
import type { PurchaseOrderStatus } from "./purchase-order-service";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar, renderMultiCurrencyString } from "@/components/table-totals-bar";

type Row = {
  id: string;
  order_number: string;
  supplier_id: string;
  supplier_name: string;
  date: string;
  expected_date: string | null;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  status: PurchaseOrderStatus;
  projectIds: string[];
  projectNames: string[];
  businessId: string; // Passed in mapped data for links
};

const COLUMN_LABELS: Record<string, string> = {
  expected_date: "Expected",
  total_minor: "Total",
  status: "Status",
};

export function PurchaseOrderTable({
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
    supplierId,
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

  const supplierOptions = useMemo(
    () => Array.from(new Map(orders.map((order) => [order.supplier_id, order.supplier_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [orders],
  );
  
  const projectOptions = useMemo(
    () => Array.from(new Map(orders.flatMap((order) => order.projectIds.map((id, index) => [id, order.projectNames[index] ?? id] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [orders],
  );

  const initialColumns = useMemo(
    () => ({ expected_date: true, total_minor: true, status: true }),
    [],
  );
  
  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "purchase-orders",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => orders.filter((order) => (
    (!status || order.status === status)
    && (!supplierId || order.supplier_id === supplierId)
    && (!projectId || order.projectIds.includes(projectId))
    && (!fromDate || order.date >= fromDate)
    && (!toDate || order.date <= toDate)
    && `${order.order_number} ${order.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase())
  )).map((order) => ({ ...order, businessId })), [fromDate, orders, projectId, query, status, supplierId, toDate, businessId]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "order_number",
        header: "Order",
        cell: ({ row }: any) => (
          <Link
            href={`/b/${row.original.businessId}/purchases/orders/${row.original.id}`}
            className="tabular font-medium text-primary hover:underline"
          >
            {row.original.order_number}
          </Link>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: "Supplier",
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
          <span className="money text-right">
            {formatMoney(row.original.total_minor, row.original.currency_code, row.original.currency_minor_unit)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: any) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        cell: ({ row }: any) => {
          const order = row.original;
          const canEdit =
            order.status !== "closed" &&
            order.status !== "cancelled" &&
            order.status !== "superseded" &&
            order.status !== "pending_approval";
          const canBill = order.status === "issued";
          const hasUpper = (canEdit && canEditPerm) || canExportPerm;
          const hasLower = canBill && (canCreatePerm || canCreateInventoryPerm);
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
                      <Link href={`/b/${order.businessId}/purchases/orders/${order.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Order
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem permission="export" asChild>
                    <a href={`/api/businesses/${order.businessId}/documents/purchase-order/${order.id}/pdf`} target="_blank" rel="noreferrer">
                      <Download className="size-4 text-muted-foreground" /> Download PDF
                    </a>
                  </DropdownMenuItem>
                  {canBill && (
                    <>
                      {hasUpper && hasLower && <DropdownMenuSeparator />}
                      <DropdownMenuItem permission="create" asChild>
                        <Link href={`/b/${order.businessId}/purchases/invoices/new?orderId=${order.id}`}>
                          <FileText className="size-4 text-muted-foreground" /> Bill Purchase Order
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem permission="create" permissionModule="inventory" asChild>
                        <Link href={`/b/${order.businessId}/purchases/goods-receipts/new?orderId=${order.id}`}>
                          <PackagePlus className="size-4 text-muted-foreground" /> Receive Goods
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
  const hasActiveFilter = Boolean(supplierId || projectId || fromDate || toDate || status || query);

  const totalPOValueStr = useMemo(() => {
    const activeRows = status === "cancelled" ? rows : rows.filter((r) => r.status !== "cancelled" && r.status !== "superseded");
    return renderMultiCurrencyString(
      activeRows.map((r) => ({
        amount: r.total_minor,
        currency: r.currency_code,
        minorUnit: r.currency_minor_unit,
      }))
    );
  }, [rows, status]);
  const activeCount = useMemo(
    () => rows.filter((r) => r.status === "issued" || r.status === "draft").length,
    [rows]
  );

  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search purchase orders…" ariaLabel="Search purchase orders" />
      <ToolbarSelect value={supplierId} onChange={(val) => setFilter("supplierId", val)} ariaLabel="Filter by supplier" className="min-w-36 max-w-52" options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <ToolbarSelect value={projectId} onChange={(val) => setFilter("projectId", val)} ariaLabel="Filter by project" className="min-w-36 max-w-52" options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <DateRangeFilter
        fromDate={fromDate}
        toDate={toDate}
        onFromChange={(val) => setFilter("from", val)}
        onToChange={(val) => setFilter("to", val)}
        fromAriaLabel="Order date from"
        toAriaLabel="Order date to"
      />
      <ToolbarSelect value={status} onChange={(val) => setFilter("status", val)} ariaLabel="Filter by status" options={[{ value: "", label: "All statuses" }, { value: "draft", label: "Draft" }, { value: "pending_approval", label: "Pending Approval" }, { value: "issued", label: "Issued" }, { value: "closed", label: "Closed" }, { value: "cancelled", label: "Cancelled" }]} />
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <ExportCsvButton
          size="sm"
          filename={`purchase-orders-${getBusinessTodayIso()}.csv`}
          data={rows}
          columns={[
            { header: "Order Number", accessorKey: "order_number" },
            { header: "Supplier", accessorKey: "supplier_name" },
            { header: "Date", accessorKey: "date" },
            { header: "Expected Date", accessorKey: "expected_date" },
            { header: "Currency", accessorKey: "currency_code" },
            { header: "Total", accessorFn: (r: any) => minorToDecimalString(r.total_minor, r.currency_code, r.currency_minor_unit) },
            { header: "Status", accessorKey: "status" },
          ]}
        />
        <DensityToggle businessId={businessId} />
        {dropdown}
      </div>
    </ListToolbar>
    {hasActiveFilter && (
      <ActiveFiltersRow onClearAll={clearFilters}>
        {supplierId && <FilterChip onRemove={() => setFilter("supplierId", "")}>Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}</FilterChip>}
        {projectId && <FilterChip onRemove={() => setFilter("projectId", "")}>Project: {projectOptions.find(([id]) => id === projectId)?.[1]}</FilterChip>}
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
        noResultsMessage="No purchase orders match" 
        onClearFilters={clearFilters}
        getRowHref={(row: Row) => `/b/${row.businessId}/purchases/orders/${row.id}`}
      />

      {rows.length > 0 && (
        <TableTotalsBar
          filteredCount={rows.length}
          totalCount={orders.length}
          itemLabel="orders"
          metrics={[
            { label: "Total PO Value", value: totalPOValueStr, tone: "primary" },
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
  </>;
}
