"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel,
  type LegacyColumnDef as ColumnDef
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { PurchaseOrderStatus } from "./purchase-order-service";

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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

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
        meta: { className: "text-right" },
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
        meta: { className: "w-12" },
        enableSorting: false,
        cell: ({ row }: any) => (
          <Button asChild variant="ghost" size="icon">
            <Link href={`/b/${row.original.businessId}/purchases/orders/${row.original.id}`} aria-label={`Open ${row.original.order_number}`}>
              <MoreHorizontal className="size-4" />
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const table = useTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility: colVisibility,
    },
    onSortingChange: setSorting,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
  });

  const clearFilters = () => { setQuery(""); setStatus(""); setSupplierId(""); setProjectId(""); setFromDate(""); setToDate(""); };
  const hasActiveFilter = Boolean(supplierId || projectId || fromDate || toDate || status || query);

  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={setQuery} placeholder="Search purchase orders…" ariaLabel="Search purchase orders" />
      <ToolbarSelect value={supplierId} onChange={setSupplierId} ariaLabel="Filter by supplier" className="min-w-44" options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <ToolbarSelect value={projectId} onChange={setProjectId} ariaLabel="Filter by project" className="min-w-44" options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Order date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Order date to" className="w-38" />
      <ToolbarSelect value={status} onChange={setStatus} ariaLabel="Filter by status" options={[{ value: "", label: "All statuses" }, { value: "draft", label: "Draft" }, { value: "issued", label: "Issued" }, { value: "closed", label: "Closed" }, { value: "cancelled", label: "Cancelled" }]} />
      {dropdown}
    </ListToolbar>
    {hasActiveFilter && <ListToolbar>
      {supplierId && <FilterChip onRemove={() => setSupplierId("")}>Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}</FilterChip>}
      {projectId && <FilterChip onRemove={() => setProjectId("")}>Project: {projectOptions.find(([id]) => id === projectId)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
      {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
    </ListToolbar>}

    <DataTable 
      table={table} 
      minWidth="min-w-[780px]" 
      noResultsMessage="No purchase orders match" 
    />
  </>;
}
