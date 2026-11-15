"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ClientListPagination, useTablePagination } from "@/components/list-pagination";
import { ActiveFiltersRow, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { StatusBadge } from "@/components/status-badge";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatMoney } from "@/core/format";
import { formatQuantityMicros, formatUnitCostMicros } from "./inventory-valuation";
import { InventoryItemRowActions } from "./inventory-item-row-actions";

export type InventoryItemRow = {
  id: string;
  sku: string | null;
  name: string;
  unit_name: string;
  quantity_micros: number;
  average_unit_cost_micros: number;
  value_minor: number;
  to_receive_micros: number;
  to_deliver_micros: number;
  is_active: number | boolean;
};

const COLUMN_LABELS: Record<string, string> = {
  sku: "SKU",
  quantity_micros: "On Hand",
  average_unit_cost_micros: "Avg Cost",
  value_minor: "Value",
  to_receive_micros: "To Receive",
  to_deliver_micros: "To Deliver",
  is_active: "Status",
};

export function InventoryItemTable({
  businessId,
  currency,
  items,
  initialSearch = "",
  initialStatus = "",
  serverSnapshot,
}: {
  businessId: string;
  currency: string;
  items: InventoryItemRow[];
  initialSearch?: string;
  initialStatus?: string;
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const [query, setQuery] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [sorting, setSorting] = useState<SortingState>([]);

  const initialColumns = useMemo(
    () => ({
      sku: true,
      quantity_micros: true,
      average_unit_cost_micros: true,
      value_minor: true,
      to_receive_micros: true,
      to_deliver_micros: true,
      is_active: true,
    }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "inventory-items",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const active = Boolean(item.is_active);
      if (status === "active" && !active) return false;
      if (status === "inactive" && active) return false;
      if (!q) return true;
      return `${item.sku ?? ""} ${item.name} ${item.unit_name}`.toLowerCase().includes(q);
    });
  }, [items, query, status]);

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "sku",
        header: "SKU",
        meta: { className: "tabular text-muted-foreground" },
        cell: ({ row }: { row: { original: InventoryItemRow } }) => row.original.sku ?? "—",
      },
      {
        accessorKey: "name",
        header: "Item",
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <>
            <Link href={`/b/${businessId}/inventory/items/${row.original.id}`} className="font-medium text-primary hover:underline">
              {row.original.name}
            </Link>
            <span className="ml-2 text-xs text-muted-foreground">{row.original.unit_name}</span>
          </>
        ),
      },
      {
        accessorKey: "quantity_micros",
        header: "On Hand",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <span className="money">
            {formatQuantityMicros(Number(row.original.quantity_micros))} {row.original.unit_name}
          </span>
        ),
      },
      {
        accessorKey: "average_unit_cost_micros",
        header: "Avg Cost",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <span className="money">{formatUnitCostMicros(Number(row.original.average_unit_cost_micros), currency)}</span>
        ),
      },
      {
        accessorKey: "value_minor",
        header: "Value",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <span className="money">{formatMoney(Number(row.original.value_minor), currency)}</span>
        ),
      },
      {
        accessorKey: "to_receive_micros",
        header: "To Receive",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <span className="money">{formatQuantityMicros(Number(row.original.to_receive_micros))}</span>
        ),
      },
      {
        accessorKey: "to_deliver_micros",
        header: "To Deliver",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <span className="money">{formatQuantityMicros(Number(row.original.to_deliver_micros))}</span>
        ),
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-16 text-right" },
        cell: ({ row }: { row: { original: InventoryItemRow } }) => (
          <InventoryItemRowActions businessId={businessId} itemId={row.original.id} itemName={row.original.name} />
        ),
      },
    ],
    [businessId, currency],
  );

  const { pagination, onPaginationChange, paginationInfo, setPage, setPageSize } = useTablePagination(rows.length);

  const table = useTable({
    data: rows,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange: setSorting,
    onPaginationChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = () => {
    setQuery("");
    setStatus("");
  };
  const hasActiveFilter = Boolean(query || status);

  const totalValue = useMemo(() => rows.reduce((sum, r) => sum + Number(r.value_minor || 0), 0), [rows]);
  const activeCount = useMemo(() => rows.filter((r) => Boolean(r.is_active)).length, [rows]);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search items or SKU…" ariaLabel="Search inventory items" />
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active only" },
            { value: "inactive", label: "Inactive only" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {status === "active" ? "Active only" : "Inactive only"}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[940px]"
          noResultsMessage="No inventory items match"
          onClearFilters={clearFilters}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={items.length}
            itemLabel="items"
            metrics={[
              { label: "Active", value: String(activeCount), tone: "success" },
              { label: "Total Valuation", value: formatMoney(totalValue, currency), tone: "primary" },
            ]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
