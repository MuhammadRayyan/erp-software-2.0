"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Columns3, Filter, MoreHorizontal } from "lucide-react";
import type { SortingState } from "@tanstack/react-table";
import { getCoreRowModel, getSortedRowModel, useLegacyTable, type LegacyColumnDef } from "@tanstack/react-table/legacy";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { DocumentStatusBadge, PaymentStatusBadge } from "./invoice-status";
import type { DocumentStatus, PaymentStatus } from "./invoice-service";

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
  paymentStatus: PaymentStatus | null;
  documentStatus: DocumentStatus;
  projectIds: string[];
  projectNames: string[];
};

const filterLabels: Record<string, string> = {
  "document:draft": "Draft",
  "document:posted": "Posted",
  "document:void": "Void",
  "payment:unpaid": "Unpaid",
  "payment:partially_paid": "Partially Paid",
  "payment:paid": "Paid",
  "payment:overdue": "Overdue",
};

export function InvoiceTable({ businessId, invoices, customFields = [], customValues = {}, serverSnapshot }: { businessId: string; invoices: InvoiceRow[]; customFields?: CustomFieldColumn[]; customValues?: Record<string, Record<string, string>>; serverSnapshot?: ColumnVisibility }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  // Memoized so the shared visibility hook sees a stable defaults reference.
  const initialVisibility = useMemo(() => ({ dueDate: true, balanceMinor: true, paymentStatus: true, documentStatus: true, ...Object.fromEntries(customFields.map((field) => [field.id, true])) }), [customFields]);
  const { visibility: visible, setAll: setVisible } = useColumnVisibility("sales-invoices", initialVisibility, { businessId, serverSnapshot });
  const customerOptions = useMemo(
    () => Array.from(new Map(invoices.map((invoice) => [invoice.customerId, invoice.customerName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
  const projectOptions = useMemo(() => Array.from(new Map(invoices.flatMap((invoice) => invoice.projectIds.map((id, index) => [id, invoice.projectNames[index] ?? id] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1])), [invoices]);
  const data = useMemo(() => invoices.filter((invoice) => {
    const [kind, status] = statusFilter.split(":");
    const matchesStatus = !statusFilter || (kind === "document" ? invoice.documentStatus === status : invoice.paymentStatus === status);
    const matchesQuery = [invoice.invoiceNumber, invoice.customerName].some((value) => value.toLowerCase().includes(query.toLowerCase().trim()));
    return matchesStatus && matchesQuery && (!customerFilter || invoice.customerId === customerFilter) && (!projectFilter || invoice.projectIds.includes(projectFilter)) && (!fromDate || invoice.invoiceDate >= fromDate) && (!toDate || invoice.invoiceDate <= toDate);
  }), [customerFilter, fromDate, invoices, projectFilter, query, statusFilter, toDate]);
  const columns = useMemo<LegacyColumnDef<InvoiceRow>[]>(() => [
    { accessorKey: "invoiceNumber", header: "Invoice", cell: ({ row }) => <Link href={`/b/${businessId}/sales/invoices/${row.original.id}`} className="tabular font-medium text-primary hover:underline">{row.original.invoiceNumber}</Link> },
    { accessorKey: "customerName", header: "Customer" },
    { accessorKey: "invoiceDate", header: "Invoice Date", cell: ({ row }) => formatDate(row.original.invoiceDate, { day: "2-digit", month: "short", year: "numeric" }) },
    { accessorKey: "dueDate", header: "Due Date", cell: ({ row }) => formatDate(row.original.dueDate, { day: "2-digit", month: "short", year: "numeric" }) },
    { accessorKey: "totalMinor", header: "Total", cell: ({ row }) => <span className="money">{formatMoney(row.original.totalMinor, row.original.currencyCode, row.original.currencyMinorUnit)}</span> },
    { accessorKey: "balanceMinor", header: "Balance", cell: ({ row }) => <span className="money">{row.original.documentStatus === "posted" ? formatMoney(row.original.balanceMinor, row.original.currencyCode, row.original.currencyMinorUnit) : "—"}</span> },
    { accessorKey: "paymentStatus", header: "Payment Status", cell: ({ row }) => row.original.paymentStatus ? <PaymentStatusBadge status={row.original.paymentStatus} /> : <span className="text-muted-foreground">—</span> },
    { accessorKey: "documentStatus", header: "Document Status", cell: ({ row }) => <DocumentStatusBadge status={row.original.documentStatus} /> },
    ...customFields.map((field) => ({
      accessorKey: field.id,
      header: field.name,
      cell: ({ row }: { row: { original: InvoiceRow } }) => <span className="text-muted-foreground">{formatCustomFieldValue(field.fieldType, customValues[row.original.id]?.[field.id])}</span>,
    })),
  ], [businessId, customFields, customValues]);
  const table = useLegacyTable({ data, columns, state: { sorting, columnVisibility: visible }, onSortingChange: setSorting, onColumnVisibilityChange: setVisible, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const toggleColumns = ([["dueDate", "Due date"], ["balanceMinor", "Balance"], ["paymentStatus", "Payment status"], ["documentStatus", "Document status"]] as [string, string][]).concat(customFields.map((field) => [field.id, field.name] as [string, string]));
  const clearFilters = () => { setQuery(""); setStatusFilter(""); setCustomerFilter(""); setProjectFilter(""); setFromDate(""); setToDate(""); };

  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={setQuery} placeholder="Search invoices…" ariaLabel="Search invoices" />
      <ToolbarSelect value={customerFilter} onChange={setCustomerFilter} ariaLabel="Filter by customer" className="min-w-44" options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <ToolbarSelect value={projectFilter} onChange={setProjectFilter} ariaLabel="Filter by project" className="min-w-44" options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Invoice date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Invoice date to" className="w-38" />
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary"><Filter className="size-4" /> Filter</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setStatusFilter("")}>All invoices</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuLabel>Document</DropdownMenuLabel>{["draft", "posted", "void"].map((status) => <DropdownMenuItem key={status} onSelect={() => setStatusFilter(`document:${status}`)}>{filterLabels[`document:${status}`]}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuLabel>Payment</DropdownMenuLabel>{["unpaid", "partially_paid", "paid", "overdue"].map((status) => <DropdownMenuItem key={status} onSelect={() => setStatusFilter(`payment:${status}`)}>{filterLabels[`payment:${status}`]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary"><Columns3 className="size-4" /> Columns</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{toggleColumns.map(([id, label]) => <DropdownMenuItem key={id} onSelect={(event) => { event.preventDefault(); table.getColumn(id)?.toggleVisibility(); }}><span className="w-4">{table.getColumn(id)?.getIsVisible() ? "✓" : ""}</span>{label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    </ListToolbar>
    {(customerFilter || projectFilter || fromDate || toDate || statusFilter) && <ListToolbar>
      {customerFilter && <FilterChip onRemove={() => setCustomerFilter("")}>Customer: {customerOptions.find(([id]) => id === customerFilter)?.[1]}</FilterChip>}
      {projectFilter && <FilterChip onRemove={() => setProjectFilter("")}>Project: {projectOptions.find(([id]) => id === projectFilter)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {statusFilter && <FilterChip onRemove={() => setStatusFilter("")}>Status: {filterLabels[statusFilter]}</FilterChip>}
    </ListToolbar>}
    {data.length === 0 ? <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No invoices match these filters</p><p className="mt-1 text-sm text-muted-foreground">Try a different invoice number, customer, date range, or status.</p><Button variant="ghost" className="mt-2" onClick={clearFilters}>Clear filters</Button></div> : <div className="data-panel overflow-x-auto"><table className="data-table min-w-[1100px]"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} className={["totalMinor", "balanceMinor"].includes(header.column.id) ? "text-right!" : ""}><button type="button" className="inline-flex items-center gap-1" onClick={header.column.getToggleSortingHandler()}>{header.isPlaceholder ? null : table.FlexRender({ header })}{header.column.getIsSorted() === "asc" ? <ArrowUp className="size-3" /> : header.column.getIsSorted() === "desc" ? <ArrowDown className="size-3" /> : null}</button></th>)}<th className="w-12"><span className="sr-only">Actions</span></th></tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id} className={["totalMinor", "balanceMinor"].includes(cell.column.id) ? "text-right" : ""}>{table.FlexRender({ cell })}</td>)}<td><Button asChild variant="ghost" size="icon"><Link href={`/b/${businessId}/sales/invoices/${row.original.id}`} aria-label={`Open ${row.original.invoiceNumber}`}><MoreHorizontal className="size-4" /></Link></Button></td></tr>)}</tbody></table></div>}
  </>;
}
