"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel,
  type LegacyColumnDef as ColumnDef
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/core/format";
import type { ProjectListRow } from "./project-service";
import { ProjectStatusBadge } from "./project-status";

const COLUMN_LABELS: Record<string, string> = {
  customerName: "Customer",
  status: "Status",
  revenueMinor: "Revenue",
  costMinor: "Cost",
  profitMinor: "Profit",
};

export function ProjectTable({ 
  businessId, 
  currency, 
  projects,
  serverSnapshot,
}: { 
  businessId: string; 
  currency: string; 
  projects: ProjectListRow[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const customerOptions = useMemo(() => Array.from(new Map(projects.flatMap((project) => project.customerId && project.customerName ? [[project.customerId, project.customerName] as const] : [])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [projects]);

  const initialColumns = useMemo(
    () => ({ customerName: true, status: true, revenueMinor: true, costMinor: true, profitMinor: true }),
    [],
  );

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "projects",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(() => projects.filter((project) => {
    const text = `${project.code} ${project.name} ${project.customerName ?? ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (!status || project.status === status) && (!customerId || project.customerId === customerId) && (!fromDate || (project.startDate ?? "") >= fromDate) && (!toDate || (project.targetEndDate ?? "9999-12-31") <= toDate);
  }).map((project) => ({ ...project, businessId, currency })), [customerId, fromDate, projects, query, status, toDate, businessId, currency]);
  
  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "code",
        header: "Project",
        cell: ({ row }: any) => (
          <Link href={`/b/${row.original.businessId}/projects/${row.original.id}`} className="font-medium text-primary hover:underline">
            <span className="tabular">{row.original.code}</span>
            <span className="ml-2 text-foreground">{row.original.name}</span>
          </Link>
        ),
      },
      {
        accessorKey: "customerName",
        header: "Customer",
        cell: ({ row }: any) => row.original.customerName ?? <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }: any) => <ProjectStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "revenueMinor",
        header: "Revenue",
        meta: { className: "text-right" },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {formatMoney(row.original.revenueMinor, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "costMinor",
        header: "Cost",
        meta: { className: "text-right" },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {formatMoney(row.original.costMinor, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: "profitMinor",
        header: "Profit",
        meta: { className: "text-right" },
        cell: ({ row }: any) => (
          <span className={`money text-right font-medium ${row.original.profitMinor < 0 ? "text-danger" : ""}`}>
            {formatMoney(row.original.profitMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12" },
        enableSorting: false,
        cell: ({ row }: any) => (
          <Button asChild variant="ghost" size="icon">
            <Link href={`/b/${row.original.businessId}/projects/${row.original.id}`} aria-label={`Open ${row.original.code}`}>
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

  const hasActiveFilter = Boolean(customerId || status || query || fromDate || toDate);
  const statusLabel = (s: string) => s === "draft" ? "Draft" : s === "active" ? "Active" : s === "on_hold" ? "On Hold" : s === "completed" ? "Completed" : s === "cancelled" ? "Cancelled" : s;

  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={setQuery} placeholder="Search projects…" ariaLabel="Search projects" />
      <ToolbarSelect
        value={status}
        onChange={setStatus}
        ariaLabel="Filter by project status"
        options={[
          { value: "", label: "All statuses" },
          { value: "draft", label: "Draft" },
          { value: "active", label: "Active" },
          { value: "on_hold", label: "On Hold" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ]}
      />
      <ToolbarSelect
        value={customerId}
        onChange={setCustomerId}
        ariaLabel="Filter by customer"
        className="min-w-44"
        options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]}
      />
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Project start date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Project target end date to" className="w-38" />
      {dropdown}
    </ListToolbar>
    {hasActiveFilter && (
      <ListToolbar>
        {customerId && (
          <FilterChip onRemove={() => setCustomerId("")}>
            Customer: {customerOptions.find(([id]) => id === customerId)?.[1]}
          </FilterChip>
        )}
        {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
        {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {fromDate}</FilterChip>}
        {toDate && <FilterChip onRemove={() => setToDate("")}>To: {toDate}</FilterChip>}
        {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
      </ListToolbar>
    )}
    <DataTable 
      table={table} 
      minWidth="min-w-[860px]" 
      noResultsMessage="No projects match these filters" 
    />
  </>;
}
