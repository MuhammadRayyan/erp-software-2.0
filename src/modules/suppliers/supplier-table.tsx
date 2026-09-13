"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { type ColumnVisibility } from "@/components/use-column-visibility";
import { useColumns } from "@/components/columns-dropdown";
import { ListToolbar, SearchInput } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { DataTable } from "@/components/ui/data-table";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { formatMoney } from "@/core/format";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";

type SupplierRow = {
  id: string; name: string; email: string | null; is_active: number;
  total_purchased_minor: number; total_paid_minor: number;
};

const baseColumnLabels: Record<string, string> = { email: "Email", outstanding: "Outstanding", status: "Status" };

export function SupplierTable({
  businessId,
  currency,
  suppliers,
  customFields = [],
  customValues = {},
  serverSnapshot,
}: {
  businessId: string;
  currency: string;
  suppliers: SupplierRow[];
  customFields?: CustomFieldColumn[];
  customValues?: Record<string, Record<string, string>>;
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);

  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

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

  const rows = useMemo(() => {
    return suppliers.filter((supplier) => {
      const matches = `${supplier.name} ${supplier.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
      return matches && (!activeOnly || supplier.is_active === 1);
    });
  }, [activeOnly, query, suppliers]);

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
        cell: ({ row }: any) => (
          <span className="text-muted-foreground">
            {formatCustomFieldValue(field.fieldType, customValues[row.original.id]?.[field.id])}
          </span>
        ),
      })),
    ],
    [businessId, currency, customFields, customValues],
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

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search suppliers…" ariaLabel="Search suppliers" />
        <Button type="button" variant={activeOnly ? "primary" : "secondary"} onClick={() => setActiveOnly((value) => !value)}>
          <Filter className="size-4" /> Active only
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
      </ListToolbar>
      {(query || activeOnly) && (
        <div className="mb-3">
          <FilterChip onRemove={() => { setQuery(""); setActiveOnly(false); }}>
            Clear filters
          </FilterChip>
        </div>
      )}
      <DataTable
        table={table}
        density={density}
        minWidth="min-w-[720px]"
        noResultsMessage="No suppliers match these filters"
        noResultsSubtext="Clear the search or active-status filter."
      />
    </>
  );
}

