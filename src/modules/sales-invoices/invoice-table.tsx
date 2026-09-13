"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, MoreHorizontal } from "lucide-react";
import { useColumns } from "@/components/columns-dropdown";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { DocumentStatusBadge, PaymentStatusBadge } from "./invoice-status";
import type { DocumentStatus, PaymentStatus } from "./invoice-service";
import type { ColumnVisibility } from "@/components/use-column-visibility";

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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const customerOptions = useMemo(
    () => Array.from(new Map(invoices.map((invoice) => [invoice.customerId, invoice.customerName])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
  const projectOptions = useMemo(
    () => Array.from(new Map(invoices.flatMap((invoice) => invoice.projectIds.map((id, index) => [id, invoice.projectNames[index] ?? id] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );

  const data = useMemo(() => invoices.filter((invoice) => {
    const [kind, status] = statusFilter.split(":");
    const matchesStatus = !statusFilter || (kind === "document" ? invoice.documentStatus === status : invoice.paymentStatus === status);
    const matchesQuery = [invoice.invoiceNumber, invoice.customerName].some((value) => value.toLowerCase().includes(query.toLowerCase().trim()));
    return matchesStatus && matchesQuery && (!customerFilter || invoice.customerId === customerFilter) && (!projectFilter || invoice.projectIds.includes(projectFilter)) && (!fromDate || invoice.invoiceDate >= fromDate) && (!toDate || invoice.invoiceDate <= toDate);
  }), [customerFilter, fromDate, invoices, projectFilter, query, statusFilter, toDate]);

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

  const { columns, dropdown } = useColumns({
    storageKey: "sales-invoices",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: columnLabels,
  });

  const clearFilters = () => { setQuery(""); setStatusFilter(""); setCustomerFilter(""); setProjectFilter(""); setFromDate(""); setToDate(""); };

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

      {dropdown}
    </ListToolbar>
    
    {(customerFilter || projectFilter || fromDate || toDate || statusFilter) && <ListToolbar>
      {customerFilter && <FilterChip onRemove={() => setCustomerFilter("")}>Customer: {customerOptions.find(([id]) => id === customerFilter)?.[1]}</FilterChip>}
      {projectFilter && <FilterChip onRemove={() => setProjectFilter("")}>Project: {projectOptions.find(([id]) => id === projectFilter)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {statusFilter && <FilterChip onRemove={() => setStatusFilter("")}>Status: {filterLabels[statusFilter]}</FilterChip>}
    </ListToolbar>}
    
    {data.length === 0 ? (
      <div className="rounded-lg border border-border bg-surface py-10 text-center">
        <p className="font-medium">No invoices match these filters</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a different invoice number, customer, date range, or status.</p>
        <Button variant="ghost" className="mt-2" onClick={clearFilters}>Clear filters</Button>
      </div>
    ) : (
      <div className="data-panel overflow-x-auto">
        <table className="data-table min-w-[1100px]">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Invoice Date</th>
              {columns.dueDate && <th>Due Date</th>}
              <th className="text-right!">Total</th>
              {columns.balanceMinor && <th className="text-right!">Balance</th>}
              {columns.paymentStatus && <th>Payment Status</th>}
              {columns.documentStatus && <th>Document Status</th>}
              {customFields.map((field) => columns[field.id] && <th key={field.id}>{field.name}</th>)}
              <th className="w-12"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <Link href={`/b/${businessId}/sales/invoices/${invoice.id}`} className="tabular font-medium text-primary hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td>{invoice.customerName}</td>
                <td>{formatDate(invoice.invoiceDate, { day: "2-digit", month: "short", year: "numeric" })}</td>
                {columns.dueDate && <td>{formatDate(invoice.dueDate, { day: "2-digit", month: "short", year: "numeric" })}</td>}
                <td className="money text-right">
                  {formatMoney(invoice.totalMinor, invoice.currencyCode, invoice.currencyMinorUnit)}
                </td>
                {columns.balanceMinor && (
                  <td className="money text-right">
                    {invoice.documentStatus === "posted" ? formatMoney(invoice.balanceMinor, invoice.currencyCode, invoice.currencyMinorUnit) : "—"}
                  </td>
                )}
                {columns.paymentStatus && (
                  <td>
                    {invoice.paymentStatus ? <PaymentStatusBadge status={invoice.paymentStatus} /> : <span className="text-muted-foreground">—</span>}
                  </td>
                )}
                {columns.documentStatus && (
                  <td>
                    <DocumentStatusBadge status={invoice.documentStatus} />
                  </td>
                )}
                {customFields.map((field) => 
                  columns[field.id] && (
                    <td key={field.id}>
                      <span className="text-muted-foreground">{formatCustomFieldValue(field.fieldType, customValues[invoice.id]?.[field.id])}</span>
                    </td>
                  )
                )}
                <td>
                  <Button asChild variant="ghost" size="icon">
                    <Link href={`/b/${businessId}/sales/invoices/${invoice.id}`} aria-label={`Open ${invoice.invoiceNumber}`}>
                      <MoreHorizontal className="size-4" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>;
}
