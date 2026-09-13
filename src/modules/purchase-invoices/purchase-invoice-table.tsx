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
import { StatusFilterSelect } from "@/components/status-filter-select";
import { useColumns } from "@/components/columns-dropdown";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import type { PurchaseInvoiceStatus, PurchasePaymentStatus } from "./purchase-invoice-service";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";

type Row = {
  id: string;
  internal_number: string;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_minor: number;
  balanceMinor: number;
  currency_code: string;
  currency_minor_unit: number;
  document_status: PurchaseInvoiceStatus;
  paymentStatus: PurchasePaymentStatus | null;
  projectIds: string[];
  projectNames: string[];
  businessId: string; // Passed in mapped data for links
};

// Columns a user can toggle off. The "Bill" + "Supplier" columns stay
// always-on — they're the primary identifier and link target. The
// toggle set mirrors what manager.io exposes: date fields, money,
// and the document/payment status pills (advanced users hide them to
// fit more columns on small screens).
const COLUMN_LABELS: Record<string, string> = {
  supplierInvoice: "Supplier invoice #",
  date: "Date",
  due: "Due",
  total: "Total",
  balance: "Balance",
  payment: "Payment",
  document: "Document",
};

export function PurchaseInvoiceTable({
  businessId,
  invoices,
  serverSnapshot,
}: {
  businessId: string;
  invoices: Omit<Row, "businessId">[];
  /** Server-loaded snapshot for the "purchase-invoices" storage key. */
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const supplierOptions = useMemo(
    () => Array.from(new Map(invoices.map((invoice) => [invoice.supplier_id, invoice.supplier_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          invoices.flatMap((invoice) => invoice.projectIds.map((id, index) => [id, invoice.projectNames[index] ?? id] as const)),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "purchase-invoices",
    businessId,
    serverSnapshot,
    initial: {
      supplierInvoice: true,
      date: true,
      due: true,
      total: true,
      balance: true,
      payment: true,
      document: true,
    },
    labels: COLUMN_LABELS,
  });
  const rows = useMemo(
    () =>
      invoices
        .filter((invoice) => {
          const [kind, value] = status.split(":");
          const matchesStatus = !status || (kind === "document" ? invoice.document_status === value : invoice.paymentStatus === value);
          const matchesQuery = `${invoice.internal_number} ${invoice.supplier_name} ${invoice.supplier_invoice_number}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
          return (
            matchesStatus &&
            matchesQuery &&
            (!supplierId || invoice.supplier_id === supplierId) &&
            (!projectId || invoice.projectIds.includes(projectId))
          );
        })
        .map((invoice) => ({ ...invoice, businessId })),
    [invoices, projectId, query, status, supplierId, businessId],
  );
  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "internal_number",
        header: "Bill",
        cell: ({ row }: any) => (
          <Link href={`/b/${row.original.businessId}/purchases/invoices/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.internal_number}
          </Link>
        ),
      },
      {
        accessorKey: "supplier_name",
        header: "Supplier",
        meta: { wrap: true },
      },
      {
        id: "supplierInvoice",
        accessorFn: (row: any) => row.supplier_invoice_number,
        header: "Supplier invoice",
        cell: ({ row }: any) => <span className="tabular text-muted-foreground">{row.original.supplier_invoice_number}</span>,
      },
      {
        id: "date",
        accessorFn: (row: any) => row.invoice_date,
        header: "Date",
        cell: ({ row }: any) => formatDate(row.original.invoice_date),
      },
      {
        id: "due",
        accessorFn: (row: any) => row.due_date,
        header: "Due",
        cell: ({ row }: any) => formatDate(row.original.due_date),
      },
      {
        id: "total",
        accessorFn: (row: any) => row.total_minor,
        header: "Total",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {formatMoney(row.original.total_minor, row.original.currency_code, row.original.currency_minor_unit)}
          </span>
        ),
      },
      {
        id: "balance",
        accessorFn: (row: any) => row.balanceMinor,
        header: "Balance",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money text-right">
            {row.original.document_status === "posted" ? formatMoney(row.original.balanceMinor, row.original.currency_code, row.original.currency_minor_unit) : "—"}
          </span>
        ),
      },
      {
        id: "payment",
        accessorFn: (row: any) => row.paymentStatus,
        header: "Payment",
        cell: ({ row }: any) => row.original.paymentStatus ? <StatusBadge status={row.original.paymentStatus} /> : "—",
      },
      {
        id: "document",
        accessorFn: (row: any) => row.document_status,
        header: "Document",
        cell: ({ row }: any) => <StatusBadge status={row.original.document_status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: "w-12" },
        enableSorting: false,
        cell: ({ row }: any) => (
          <Button asChild variant="ghost" size="icon">
            <Link href={`/b/${row.original.businessId}/purchases/invoices/${row.original.id}`} aria-label={`Open ${row.original.internal_number}`}>
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

  const statusValue = status.split(":")[1] as PurchaseInvoiceStatus | PurchasePaymentStatus | undefined;
  const statusText = statusLabel(statusValue ?? "");
  const hasActiveFilter = Boolean(supplierId || projectId || status || query);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search purchase invoices…" ariaLabel="Search purchase invoices" />
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
        <StatusFilterSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter invoices"
          options={[
            { value: "", label: "All statuses" },
            { label: "Document", options: [
              { value: "document:draft", label: "Draft" },
              { value: "document:posted", label: "Posted" },
              { value: "document:void", label: "Void" },
            ]},
            { label: "Payment", options: [
              { value: "payment:unpaid", label: "Unpaid" },
              { value: "payment:partially_paid", label: "Partially Paid" },
              { value: "payment:paid", label: "Paid" },
              { value: "payment:overdue", label: "Overdue" },
            ]},
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
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
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusText}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ListToolbar>
      )}
      <DataTable 
        table={table}
        density={density}
        pinFirstColumn 
        minWidth="min-w-[640px]" 
        noResultsMessage="No purchase invoices match" 
      />
    </>
  );
}
