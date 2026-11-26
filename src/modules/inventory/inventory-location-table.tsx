"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getPaginationRowModel as createPaginationRowModel,
  getSortedRowModel as createSortedRowModel,
} from "@tanstack/react-table/legacy";
import { useColumns } from "@/components/columns-dropdown";
import { DensityToggle } from "@/components/density-toggle";
import { ClientListPagination } from "@/components/list-pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useUrlListState } from "@/hooks/use-url-list-state";
import { ActiveFiltersRow, FilterChip, ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { StatusBadge } from "@/components/status-badge";
import { TableTotalsBar } from "@/components/table-totals-bar";
import { Badge } from "@/components/ui/badge";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { useTableDensity } from "@/components/use-table-density";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { formatMoney, minorToDecimalString, getBusinessTodayIso } from "@/core/format";
import { formatQuantityMicros } from "./inventory-valuation";
import { InventoryLocationRowActions } from "./inventory-location-row-actions";

export type InventoryLocationRow = {
  id: string;
  code: string;
  name: string;
  is_default: number | boolean;
  quantity_micros: number;
  value_minor: number;
  is_active: number | boolean;
};

const COLUMN_LABELS: Record<string, string> = {
  quantity_micros: "Total Quantity",
  value_minor: "Value",
  is_active: "Status",
};

export function InventoryLocationTable({
  businessId,
  currency,
  locations,
  serverSnapshot,
}: {
  businessId: string;
  currency: string;
  locations: InventoryLocationRow[];
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);
  const {
    query,
    status,
    sorting,
    setFilter,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  } = useUrlListState({ defaultSort: "name", defaultDir: "asc" });

  const initialColumns = useMemo(
    () => ({ quantity_micros: true, value_minor: true, is_active: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "inventory-locations",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((loc) => {
      const active = Boolean(loc.is_active);
      if (status === "active" && !active) return false;
      if (status === "inactive" && active) return false;
      if (!q) return true;
      return `${loc.code} ${loc.name}`.toLowerCase().includes(q);
    });
  }, [locations, query, status]);

  const columns: any[] = useMemo(
    () => [
      { accessorKey: "code", header: "Code", meta: { className: "tabular" } },
      {
        accessorKey: "name",
        header: "Location",
        cell: ({ row }: { row: { original: InventoryLocationRow } }) => (
          <>
            <Link href={`/b/${businessId}/inventory/locations/${row.original.id}`} className="font-medium text-primary hover:underline">
              {row.original.name}
            </Link>
            {row.original.is_default ? (
              <Badge className="ml-2" tone="info">
                Default
              </Badge>
            ) : null}
          </>
        ),
      },
      {
        accessorKey: "quantity_micros",
        header: "Total Quantity",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: InventoryLocationRow } }) => (
          <span className="money">{formatQuantityMicros(Number(row.original.quantity_micros))}</span>
        ),
      },
      {
        accessorKey: "value_minor",
        header: "Value",
        meta: { numeric: true },
        cell: ({ row }: { row: { original: InventoryLocationRow } }) => (
          <span className="money">{formatMoney(Number(row.original.value_minor), currency)}</span>
        ),
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }: { row: { original: InventoryLocationRow } }) => (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-16 text-right" },
        cell: ({ row }: { row: { original: InventoryLocationRow } }) => (
          <InventoryLocationRowActions businessId={businessId} locationId={row.original.id} locationName={row.original.name} />
        ),
      },
    ],
    [businessId, currency],
  );

  const { pagination, paginationInfo } = buildPagination(rows.length);

  const table = useTable({
    data: rows,
    columns,
    state: { sorting, pagination, columnVisibility: colVisibility },
    onSortingChange,
    getCoreRowModel: createCoreRowModel(),
    getSortedRowModel: createSortedRowModel(),
    getPaginationRowModel: createPaginationRowModel(),
  });

  const clearFilters = resetFilters;
  const hasActiveFilter = Boolean(query || status);

  const totalValue = useMemo(() => rows.reduce((sum, r) => sum + Number(r.value_minor || 0), 0), [rows]);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={(val) => setFilter("q", val)} placeholder="Search locations or code…" ariaLabel="Search inventory locations" />
        <ToolbarSelect
          value={status}
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
            filename={`inventory-locations-${getBusinessTodayIso()}.csv`}
            data={rows}
            columns={[
              { header: "Code", accessorKey: "code" },
              { header: "Name", accessorKey: "name" },
              { header: "Total Quantity", accessorFn: (r: InventoryLocationRow) => formatQuantityMicros(Number(r.quantity_micros)) },
              { header: "Valuation", accessorFn: (r: InventoryLocationRow) => minorToDecimalString(Number(r.value_minor || 0), currency) },
              { header: "Status", accessorFn: (r: InventoryLocationRow) => (r.is_active ? "Active" : "Inactive") },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {status && <FilterChip onRemove={() => setFilter("status", "")}>Status: {status === "active" ? "Active only" : "Inactive only"}</FilterChip>}
          {query && <FilterChip onRemove={() => setFilter("q", "")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-table-md"
          noResultsMessage="No locations match"
          onClearFilters={clearFilters}
          getRowHref={(row: InventoryLocationRow) => `/b/${businessId}/inventory/locations/${row.id}`}
        />
        {rows.length > 0 && (
          <TableTotalsBar
            filteredCount={rows.length}
            totalCount={locations.length}
            itemLabel="locations"
            metrics={[{ label: "Total Valuation", value: formatMoney(totalValue, currency), tone: "primary" }]}
          />
        )}
        <ClientListPagination info={paginationInfo} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </ListTableCard>
    </>
  );
}
