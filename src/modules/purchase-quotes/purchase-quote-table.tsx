"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { PurchaseQuoteStatus } from "./purchase-quote-service";

type Row = {
  id: string;
  quote_number: string;
  revision_number?: number;
  is_latest_revision?: number;
  supplier_id: string;
  supplier_name: string;
  date: string;
  expected_date: string | null;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  documentStatus: PurchaseQuoteStatus;
  projectIds: string[];
  projectNames: string[];
  businessId: string; // Passed in mapped data for links
};

const COLUMN_LABELS: Record<string, string> = {
  expected_date: "Expiry Date",
  total_minor: "Total",
  documentStatus: "Status",
};

export function PurchaseQuoteTable({
  businessId,
  quotes,
  serverSnapshot,
}: {
  businessId: string;
  quotes: Omit<Row, "businessId">[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const supplierOptions = useMemo(
    () =>
      Array.from(new Map(quotes.map((quote) => [quote.supplier_id, quote.supplier_name])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [quotes],
  );

  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          quotes.flatMap((quote) => quote.projectIds.map((id, index) => [id, quote.projectNames[index] ?? id] as const)),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [quotes],
  );

  const initialColumns = useMemo(
    () => ({ expected_date: true, total_minor: true, documentStatus: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "purchase-quotes",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(
    () =>
      quotes
        .filter((quote) => {
          const matchesQuery = `${quote.quote_number} ${quote.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase());
          return (
            (!status || quote.documentStatus === status) &&
            (!supplierId || quote.supplier_id === supplierId) &&
            (!projectId || quote.projectIds.includes(projectId)) &&
            matchesQuery
          );
        })
        .map((quote) => ({ ...quote, businessId })),
    [quotes, projectId, query, status, supplierId, businessId],
  );

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "quote_number",
        header: "Quote Number",
        cell: ({ row }: any) => (
          <div className="flex items-center gap-1.5">
            <Link
              href={`/b/${row.original.businessId}/purchases/quotes/${row.original.id}`}
              className="tabular font-medium text-primary hover:underline"
            >
              {row.original.quote_number}
            </Link>
            {row.original.revision_number !== undefined && row.original.revision_number > 0 && (
              <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Rev {row.original.revision_number}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: "Supplier",
      },
      {
        accessorKey: "date",
        header: "Quote Date",
        cell: ({ row }: any) => formatDate(row.original.date),
      },
      {
        accessorKey: "expected_date",
        header: "Expiry Date",
        cell: ({ row }: any) => (row.original.expected_date ? formatDate(row.original.expected_date) : "—"),
      },
      {
        accessorKey: "total_minor",
        header: "Total",
        meta: { className: "text-right" },
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
        meta: { className: "w-12" },
        enableSorting: false,
        cell: ({ row }: any) => (
          <Button asChild variant="ghost" size="icon">
            <Link href={`/b/${row.original.businessId}/purchases/quotes/${row.original.id}`} aria-label={`Open ${row.original.quote_number}`}>
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

  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setSupplierId("");
    setProjectId("");
  };

  const hasActiveFilter = Boolean(supplierId || projectId || status || query);

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search purchase quotes…"
          ariaLabel="Search purchase quotes"
        />
        <ToolbarSelect
          value={supplierId}
          onChange={setSupplierId}
          ariaLabel="Filter by supplier"
          className="min-w-44"
          options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={projectId}
          onChange={setProjectId}
          ariaLabel="Filter by project"
          className="min-w-44"
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Issued / Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "superseded", label: "Superseded" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        {dropdown}
      </ListToolbar>
      {hasActiveFilter && (
        <ListToolbar>
          {supplierId && (
            <FilterChip onRemove={() => setSupplierId("")}>
              Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}
            </FilterChip>
          )}
          {projectId && (
            <FilterChip onRemove={() => setProjectId("")}>
              Project: {projectOptions.find(([id]) => id === projectId)?.[1]}
            </FilterChip>
          )}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ListToolbar>
      )}
      <DataTable
        table={table}
        minWidth="min-w-[780px]"
        noResultsMessage="No purchase quotes match"
       onClearFilters={clearFilters}
    />
    </>
  );
}
