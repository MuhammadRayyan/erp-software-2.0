"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, MoreHorizontal } from "lucide-react";
import { 
  useLegacyTable as useTable,
  getCoreRowModel as createCoreRowModel,
  getSortedRowModel as createSortedRowModel
} from "@tanstack/react-table/legacy";
import { type SortingState } from "@tanstack/react-table";
import { useColumns } from "@/components/columns-dropdown";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { formatDate, formatMoney } from "@/core/format";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { DocumentStatusBadge, PaymentStatusBadge } from "./invoice-status";
import type { DocumentStatus, PaymentStatus } from "./invoice-service";
import type { ColumnVisibility } from "@/components/use-column-visibility";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  totalMinor: number;
  balanceMinor: number;
  currencyCode: string;
  currencyMinorUnit: number;
  documentStatus: DocumentStatus;
  paymentStatus: PaymentStatus | null;
  projectIds: string[];
  projectNames: string[];
};

const filterLabels: Record<string, string> = {
  "document:draft": "Draft",
  "document:posted": "Posted",
  "document:void": "Void",
  "payment:unpaid": "Unpaid",
  "payment:partially_paid": "Partially paid",
  "payment:paid": "Paid",
  "payment:overdue": "Overdue",
};

export function InvoiceTable({
  businessId,
  invoices,
  customFields = [],
  customValues = {},
  serverSnapshot,
}: {
  businessId: string;
  invoices: InvoiceRow[];
  customFields?: CustomFieldColumn[];
  customValues?: Record<string, Record<string, string>>;
  serverSnapshot?: ColumnVisibility;
}) {
  const { density } = useTableDensity(businessId);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const customerOptions = useMemo(
    () => Array.from(new Map(invoices.map((invoice) => [invoice.customerId, invoice.customerName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
  const projectOptions = useMemo(
    () => Array.from(new Map(invoices.flatMap((invoice) => invoice.projectIds.map((id, index) => [id, invoice.projectNames[index] ?? id] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );

  const rows = useMemo(() => invoices.filter((invoice) => {
    const [kind, status] = statusFilter.split(":");
    const matchesStatus = !statusFilter || (kind === "document" ? invoice.documentStatus === status : invoice.paymentStatus === status);
    const matchesQuery = [invoice.invoiceNumber, invoice.customerName].some((value) => value.toLowerCase().includes(query.toLowerCase().trim()));
    return matchesStatus && matchesQuery && (!customerFilter || invoice.customerId === customerFilter) && (!projectFilter || invoice.projectIds.includes(projectFilter)) && (!fromDate || invoice.invoiceDate >= fromDate) && (!toDate || invoice.invoiceDate <= toDate);
  }).map(invoice => ({ ...invoice, businessId, customValues: customValues[invoice.id] })), [customerFilter, fromDate, invoices, projectFilter, query, statusFilter, toDate, businessId, customValues]);

  const initialColumns = useMemo(() => {
    const base = { dueDate: true, balanceMinor: true, paymentStatus: true, documentStatus: true } as Record<string, boolean>;
    for (const field of customFields) base[field.id] = false;
    return base;
  }, [customFields]);

  const columnLabels = useMemo(() => {
    const base = { dueDate: "Due date", balanceMinor: "Balance", paymentStatus: "Payment status", documentStatus: "Document status" } as Record<string, string>;
    for (const field of customFields) base[field.id] = field.name;
    return base;
  }, [customFields]);

  const { columns: colVisibility, dropdown } = useColumns({
    storageKey: "sales-invoices",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: columnLabels,
  });

  const columns: any[] = useMemo(() => {
    const cols: any[] = [
      {
        accessorKey: "invoiceNumber",
        header: "Invoice",
        cell: ({ row }: any) => (
          <Link href={`/b/${row.original.businessId}/sales/invoices/${row.original.id}`} className="tabular font-medium text-primary hover:underline">
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      {
        accessorKey: "customerName",
        header: "Customer",
      },
      {
        accessorKey: "invoiceDate",
        header: "Invoice Date",
        cell: ({ row }: any) => formatDate(row.original.invoiceDate, { day: "2-digit", month: "short", year: "numeric" }),
      },
      {
        accessorKey: "dueDate",
        header: "Due Date",
        cell: ({ row }: any) => formatDate(row.original.dueDate, { day: "2-digit", month: "short", year: "numeric" }),
      },
      {
        accessorKey: "totalMinor",
        header: "Total",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money">
            {formatMoney(row.original.totalMinor, row.original.currencyCode, row.original.currencyMinorUnit)}
          </span>
        ),
      },
      {
        accessorKey: "balanceMinor",
        header: "Balance",
        meta: { numeric: true },
        cell: ({ row }: any) => (
          <span className="money">
            {row.original.documentStatus === "posted" ? formatMoney(row.original.balanceMinor, row.original.currencyCode, row.original.currencyMinorUnit) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment Status",
        cell: ({ row }: any) => row.original.paymentStatus ? <PaymentStatusBadge status={row.original.paymentStatus} /> : <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "documentStatus",
        header: "Document Status",
        cell: ({ row }: any) => <DocumentStatusBadge status={row.original.documentStatus} />,
      },
    ];

    for (const field of customFields) {
      cols.push({
        accessorKey: field.id,
        header: field.name,
        cell: ({ row }: any) => {
          const val = row.original.customValues?.[field.id];
          return <span className="text-muted-foreground">{formatCustomFieldValue(field.fieldType, val)}</span>;
        }
      });
    }

    cols.push({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { className: "w-12" },
      enableSorting: false,
      cell: ({ row }: any) => (
        <Button asChild variant="ghost" size="icon">
          <Link href={`/b/${row.original.businessId}/sales/invoices/${row.original.id}`} aria-label={`Open ${row.original.invoiceNumber}`}>
            <MoreHorizontal className="size-4" />
          </Link>
        </Button>
      ),
    });

    return cols;
  }, [customFields]);

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

  const clearFilters = () => { setQuery(""); setStatusFilter(""); setCustomerFilter(""); setProjectFilter(""); setFromDate(""); setToDate(""); };
  const hasActiveFilter = Boolean(customerFilter || projectFilter || fromDate || toDate || statusFilter || query);

  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={setQuery} placeholder="Search invoices..." ariaLabel="Search invoices" />
      <ToolbarSelect value={customerFilter} onChange={setCustomerFilter} ariaLabel="Filter by customer" className="min-w-44" options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <ToolbarSelect value={projectFilter} onChange={setProjectFilter} ariaLabel="Filter by project" className="min-w-44" options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Invoice date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Invoice date to" className="w-38" />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="secondary"><Filter className="size-4" /> Filter</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setStatusFilter("")}>All invoices</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Document</DropdownMenuLabel>
          {["draft", "posted", "void"].map((status) => <DropdownMenuItem key={status} onSelect={() => setStatusFilter(`document:${status}`)}>{filterLabels[`document:${status}`]}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Payment</DropdownMenuLabel>
          {["unpaid", "partially_paid", "paid", "overdue"].map((status) => <DropdownMenuItem key={status} onSelect={() => setStatusFilter(`payment:${status}`)}>{filterLabels[`payment:${status}`]}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-2">
          <DensityToggle businessId={businessId} />
          {dropdown}
        </div>
    </ListToolbar>
    
    {hasActiveFilter && <ListToolbar>
      {customerFilter && <FilterChip onRemove={() => setCustomerFilter("")}>Customer: {customerOptions.find(([id]) => id === customerFilter)?.[1]}</FilterChip>}
      {projectFilter && <FilterChip onRemove={() => setProjectFilter("")}>Project: {projectOptions.find(([id]) => id === projectFilter)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {statusFilter && <FilterChip onRemove={() => setStatusFilter("")}>Status: {filterLabels[statusFilter]}</FilterChip>}
      {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
    </ListToolbar>}
    
    <DataTable 
      table={table}
        density={density}
        pinFirstColumn 
      minWidth="min-w-[1100px]" 
      noResultsMessage="No invoices match these filters"
      noResultsSubtext="Try a different invoice number, customer, date range, or status."
     onClearFilters={clearFilters}
    />
  </>;
}
