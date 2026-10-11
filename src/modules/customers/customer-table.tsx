"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, ChevronRight } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { ListToolbar, SearchInput, ActiveFiltersRow, FilterChip } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";

type CustomerRow = { id: string; name: string; email: string | null; phone: string | null; isActive: boolean; };

const baseColumnLabels: Record<string, string> = { email: "Email", phone: "Phone", status: "Status" };

export function CustomerTable({ businessId, customers, customFields = [], customValues = {}, serverSnapshot }: { businessId: string; customers: CustomerRow[]; customFields?: CustomFieldColumn[]; customValues?: Record<string, Record<string, string>>; serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility }) {
  const { density } = useTableDensity(businessId);

  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

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
    () => customers
      .filter((customer) => {
        const matchesQuery = [customer.name, customer.email, customer.phone].some((value) => value?.toLowerCase().includes(query.toLowerCase().trim()));
        return (!activeOnly || customer.isActive) && matchesQuery;
      })
      .map((customer) => ({ ...customer, businessId, customValues: customValues[customer.id] })), 
    [customers, query, activeOnly, businessId, customValues]
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
        meta: { className: "text-muted-foreground" },
        cell: ({ row }: any) => formatCustomFieldValue(field.fieldType, row.original.customValues?.[field.id]),
      }));

      return [
        ...baseCols,
        ...customCols,
        {
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          meta: { className: "w-12" },
          enableSorting: false,
          cell: ({ row }: any) => (
            <Button asChild variant="ghost" size="icon" className="text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
              <Link href={`/b/${row.original.businessId}/customers/${row.original.id}`} aria-label={`Open ${row.original.name}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          ),
        },
      ];
    },
    [customFields]
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

  const clearFilters = () => {
    setQuery("");
    setActiveOnly(false);
  };
  const hasActiveFilter = Boolean(query || activeOnly);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search customers…" ariaLabel="Search customers" />
        <Button
          type="button"
          variant={activeOnly ? "primary" : "secondary"}
          size="sm"
          className="h-9 gap-1.5 text-xs font-medium"
          onClick={() => setActiveOnly((value) => !value)}
        >
          <Filter className="size-3.5" /> Active only
        </Button>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {hasActiveFilter && (
        <ActiveFiltersRow onClearAll={clearFilters}>
          {activeOnly && (
            <FilterChip onRemove={() => setActiveOnly(false)}>
              Status: Active only
            </FilterChip>
          )}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ActiveFiltersRow>
      )}
      <DataTable 
        table={table}
        density={density} 
        minWidth="min-w-[800px]" 
        noResultsMessage="No customers match these filters"
        noResultsSubtext="Clear the search or active-status filter."
        onClearFilters={clearFilters}
      />
    </>
  );
}
