"use client";

import { useMemo, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { debounce, useQueryStates } from "nuqs";
import { ChevronRight, MoreHorizontal, Eye, FileEdit, FileText, FilePlus2, BookOpenText } from "lucide-react";
import {
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
} from "@tanstack/react-table/legacy";
import { Badge } from "@/components/ui/badge";
import { ListToolbar, SearchInput, ToolbarSelect, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable, ListTableCard } from "@/components/ui/data-table";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { TableTotalsBar } from "@/components/table-totals-bar";
import type { DirectoryListSummary } from "./customer-service";
import {
  directoryListParsers,
  resolveNextSortFromUpdater,
  toSortingState,
} from "@/lib/list-query-params";

type CustomerRow = { id: string; name: string; email: string | null; phone: string | null; isActive: boolean; };

const baseColumnLabels: Record<string, string> = { email: "Email", phone: "Phone", status: "Status" };

export function CustomerTable({
  businessId,
  customers,
  summary,
  customFields = [],
  customValues = {},
  serverSnapshot,
  footer,
}: {
  businessId: string;
  customers: CustomerRow[];
  summary: DirectoryListSummary;
  customFields?: CustomFieldColumn[];
  customValues?: Record<string, Record<string, string>>;
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
  footer?: ReactNode;
}) {
  const { density } = useTableDensity(businessId);

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
      phone: true,
      status: true,
      ...Object.fromEntries(customFields.map((field) => [field.id, true])),
    }),
    [customFields],
  );

  const columnLabels = useMemo(() => {
    const labels = { ...baseColumnLabels };
    customFields.forEach(field => {
      labels[field.id] = field.name;
    });
    return labels;
  }, [customFields]);

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "customers",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: columnLabels,
  });

  const rows = useMemo(
    () => customers.map((customer) => ({ ...customer, businessId, customValues: customValues[customer.id] })),
    [customers, businessId, customValues],
  );

  const columns: any[] = useMemo(
    () => {
      const baseCols = [
        {
          accessorKey: "name",
          header: "Name",
          cell: ({ row }: any) => (
            <Link className="font-medium text-primary hover:underline" href={`/b/${row.original.businessId}/customers/${row.original.id}`}>
              {row.original.name}
            </Link>
          ),
        },
        {
          accessorKey: "email",
          header: "Email",
          meta: { className: "text-muted-foreground" },
          cell: ({ row }: any) => row.original.email || "—",
        },
        {
          accessorKey: "phone",
          header: "Phone",
          meta: { className: "text-muted-foreground" },
          cell: ({ row }: any) => row.original.phone || "—",
        },
        {
          accessorKey: "status",
          header: "Status",
          cell: ({ row }: any) => (
            <Badge tone={row.original.isActive ? "success" : "neutral"}>
              {row.original.isActive ? "Active" : "Inactive"}
            </Badge>
          ),
        },
      ];

      const customCols = customFields.map((field) => ({
        accessorKey: field.id,
        header: field.name,
        enableSorting: false,
        meta: { className: "text-muted-foreground" },
        cell: ({ row }: any) => formatCustomFieldValue(field.fieldType, row.original.customValues?.[field.id]),
      }));

      return [
        ...baseCols,
        ...customCols,
        {
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          meta: { className: "w-16 text-right" },
          enableSorting: false,
          enableHiding: false,
          cell: ({ row }: any) => {
            const cust = row.original;
            return (
              <div className="flex items-center justify-end gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={`Actions for ${cust.name}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href={`/b/${cust.businessId}/customers/${cust.id}`}>
                        <Eye className="size-4 text-muted-foreground" /> View Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem permission="edit" asChild>
                      <Link href={`/b/${cust.businessId}/customers/${cust.id}/edit`}>
                        <FileEdit className="size-4 text-muted-foreground" /> Edit Customer
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/b/${cust.businessId}/customers/${cust.id}/statement`}>
                        <BookOpenText className="size-4 text-muted-foreground" /> Statement
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem permission="create" asChild>
                      <Link href={`/b/${cust.businessId}/sales/invoices/new?customerId=${cust.id}`}>
                        <FileText className="size-4 text-muted-foreground" /> New Invoice
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem permission="create" asChild>
                      <Link href={`/b/${cust.businessId}/sales/quotes/new?customerId=${cust.id}`}>
                        <FilePlus2 className="size-4 text-muted-foreground" /> New Quote
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <Link href={`/b/${cust.businessId}/customers/${cust.id}`} aria-label={`Open ${cust.name}`}>
                    <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            );
          },
        },
      ];
    },
    [customFields]
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
          placeholder="Search customers…"
          ariaLabel="Search customers"
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
          minWidth="min-w-[800px]"
          noResultsMessage="No customers match these filters"
          noResultsSubtext="Clear the search or active-status filter."
          onClearFilters={clearFilters}
        />
        {summary.filteredTotal > 0 && (
          <TableTotalsBar
            filteredCount={summary.filteredTotal}
            totalCount={summary.unfilteredTotal}
            itemLabel="customers"
            metrics={[
              { label: "Active", value: String(summary.activeCount), tone: "primary" },
            ]}
          />
        )}
        {footer}
      </ListTableCard>
    </>
  );
}
