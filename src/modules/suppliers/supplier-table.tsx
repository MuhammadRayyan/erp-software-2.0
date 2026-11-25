"use client";

import { useMemo, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { debounce, useQueryStates } from "nuqs";
import { MoreHorizontal, FileEdit, FileText, ShoppingCart, BookOpenText } from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
} from "@tanstack/react-table/legacy";
import { Badge } from "@/components/ui/badge";
import { type ColumnVisibility } from "@/components/use-column-visibility";
import { useColumns } from "@/components/columns-dropdown";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { formatMoney, minorToDecimalString } from "@/core/format";
import { DensityToggle } from "@/components/density-toggle";
import { ExportCsvButton } from "@/components/export-csv-button";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar } from "@/components/table-totals-bar";
import type { SupplierListSummary } from "./supplier-service";
import {
  directoryListParsers,
  resolveNextSortFromUpdater,
  toSortingState,
} from "@/lib/list-query-params";

type SupplierRow = {
  id: string; name: string; email: string | null; is_active: number;
  total_purchased_minor: number; total_paid_minor: number;
};

const baseColumnLabels: Record<string, string> = { email: "Email", outstanding: "Outstanding", status: "Status" };

export function SupplierTable({
  businessId,
  currency,
  suppliers,
  summary,
  customFields = [],
  customValues = {},
  serverSnapshot,
  footer,
}: {
  businessId: string;
  currency: string;
  suppliers: SupplierRow[];
  summary: SupplierListSummary;
  customFields?: CustomFieldColumn[];
  customValues?: Record<string, Record<string, string>>;
  serverSnapshot?: ColumnVisibility;
  footer?: ReactNode;
}) {
  const { density } = useTableDensity(businessId);
  const canCreatePerm = useActionPermission("create");

  const [, startTransition] = useTransition();
  const [urlState, setUrlState] = useQueryStates(directoryListParsers, {
    shallow: false,
    history: "replace",
    scroll: false,
    startTransition,
  });

  const query = urlState.q;
  const statusFilter = urlState.status;
  const sorting = useMemo(
    () => toSortingState(urlState.sort, urlState.dir),
    [urlState.sort, urlState.dir],
  );

  // Memoized so the shared visibility hook sees a stable defaults reference.
  const initialColumns = useMemo(
    () => ({
      email: true,
      outstanding: true,
      status: true,
      ...Object.fromEntries(customFields.map((field) => [field.id, true])),
    }),
    [customFields],
  );

  const labels = useMemo(() => {
    const map = { ...baseColumnLabels };
    for (const field of customFields) {
      map[field.id] = field.name;
    }
    return map;
  }, [customFields]);

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "suppliers",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels,
  });

  const rows = suppliers;

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }: any) => (
          <Link
            href={`/b/${businessId}/suppliers/${row.original.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }: any) => (
          <span className="text-muted-foreground">{row.original.email || "—"}</span>
        ),
      },
      {
        accessorKey: "outstanding",
        header: "Outstanding",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money">
            {formatMoney(
              Math.max(0, row.original.total_purchased_minor - row.original.total_paid_minor),
              currency
            )}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: any) => (
          <Badge tone={row.original.is_active ? "success" : "neutral"}>
            {row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      ...customFields.map((field) => ({
        id: field.id,
        accessorFn: (row: any) => customValues[row.id]?.[field.id],
        header: field.name,
        enableSorting: false,
        cell: ({ row }: any) => (
          <span className="text-muted-foreground">
            {formatCustomFieldValue(field.fieldType, customValues[row.original.id]?.[field.id])}
          </span>
        ),
      })),
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12 text-right" },
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }: any) => {
          const sup = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${sup.name}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem permission="edit" asChild>
                    <Link href={`/b/${businessId}/suppliers/${sup.id}/edit`}>
                      <FileEdit className="size-4 text-muted-foreground" /> Edit Supplier
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/b/${businessId}/suppliers/${sup.id}/statement`}>
                      <BookOpenText className="size-4 text-muted-foreground" /> Statement
                    </Link>
                  </DropdownMenuItem>
                  {canCreatePerm && <DropdownMenuSeparator />}
                  <DropdownMenuItem permission="create" asChild>
                    <Link href={`/b/${businessId}/purchases/invoices/new?supplierId=${sup.id}`}>
                      <FileText className="size-4 text-muted-foreground" /> New Bill
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem permission="create" asChild>
                    <Link href={`/b/${businessId}/purchases/orders/new?supplierId=${sup.id}`}>
                      <ShoppingCart className="size-4 text-muted-foreground" /> New Order
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [businessId, canCreatePerm, currency, customFields, customValues],
  );

  const table = useTable({
    data: rows,
    columns,
    manualSorting: true,
    state: {
      sorting,
      columnVisibility: colVisibility,
    },
    onSortingChange: (updater) => {
      const next = resolveNextSortFromUpdater(updater, urlState.sort, urlState.dir, "asc");
      void setUrlState({ sort: next.sort, dir: next.dir, page: 1 });
    },
    getCoreRowModel: createCoreRowModel(),
  });

  const clearFilters = () => {
    void setUrlState({ q: "", status: "", page: 1 });
  };
  const hasActiveFilter = Boolean(query || statusFilter);

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={(value) => {
            void setUrlState({ q: value, page: 1 }, { limitUrlUpdates: value ? debounce(250) : undefined });
          }}
          placeholder="Search suppliers…"
          ariaLabel="Search suppliers"
        />
        <ToolbarSelect
          value={statusFilter}
          onChange={(value) => void setUrlState({ status: value, page: 1 })}
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
            filename="suppliers"
            data={suppliers}
            totalCount={summary.filteredTotal}
            columns={[
              { header: "Name", accessorKey: "name" },
              { header: "Email", accessorFn: (r: SupplierRow) => r.email ?? "" },
              {
                header: "Outstanding",
                accessorFn: (r: SupplierRow) =>
                  minorToDecimalString(Math.max(0, r.total_purchased_minor - r.total_paid_minor), currency),
              },
              { header: "Status", accessorFn: (r: SupplierRow) => (r.is_active ? "Active" : "Inactive") },
            ]}
          />
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {statusFilter && (
            <FilterChip onRemove={() => void setUrlState({ status: "", page: 1 })}>
              Status: {statusFilter === "inactive" ? "Inactive only" : "Active only"}
            </FilterChip>
          )}
          {query && <FilterChip onRemove={() => void setUrlState({ q: "", page: 1 })}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <ListTableCard>
        <DataTable
          table={table}
          density={density}
          framed={false}
          minWidth="min-w-[720px]"
          getRowHref={(s: SupplierRow) => `/b/${businessId}/suppliers/${s.id}`}
          noResultsMessage="No suppliers match these filters"
          noResultsSubtext="Clear the search or active-status filter."
          onClearFilters={clearFilters}
        />
        {summary.filteredTotal > 0 && (
          <TableTotalsBar
            filteredCount={summary.filteredTotal}
            totalCount={summary.unfilteredTotal}
            itemLabel="suppliers"
            metrics={[
              { label: "Active", value: String(summary.activeCount), tone: "primary" },
              {
                label: "Total Outstanding",
                value: formatMoney(summary.totalOutstandingMinor, currency),
                tone: summary.totalOutstandingMinor > 0 ? "danger" : "default",
              },
            ]}
          />
        )}
        {footer}
      </ListTableCard>
    </>
  );
}

