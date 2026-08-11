"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import type { PurchaseInvoiceStatus, PurchasePaymentStatus } from "./purchase-invoice-service";

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
};

const documentTone = { draft: "neutral", posted: "info", void: "danger" } as const;
const paymentTone = { unpaid: "warning", partially_paid: "warning", paid: "success", overdue: "danger" } as const;
const paymentLabel = { unpaid: "Unpaid", partially_paid: "Partially Paid", paid: "Paid", overdue: "Overdue" };
const documentLabel = { draft: "Draft", posted: "Posted", void: "Void" };

export function PurchaseInvoiceTable({ businessId, invoices }: { businessId: string; invoices: Row[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const supplierOptions = useMemo(
    () => Array.from(new Map(invoices.map((invoice) => [invoice.supplier_id, invoice.supplier_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [invoices],
  );
  const projectOptions = useMemo(() => Array.from(new Map(invoices.flatMap((invoice) => invoice.projectIds.map((id, index) => [id, invoice.projectNames[index] ?? id] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1])), [invoices]);
  const rows = useMemo(() => invoices.filter((invoice) => {
    const [kind, value] = status.split(":");
    const matchesStatus = !status || (kind === "document" ? invoice.document_status === value : invoice.paymentStatus === value);
    const matchesQuery = `${invoice.internal_number} ${invoice.supplier_name} ${invoice.supplier_invoice_number}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesStatus && matchesQuery && (!supplierId || invoice.supplier_id === supplierId) && (!projectId || invoice.projectIds.includes(projectId)) && (!fromDate || invoice.invoice_date >= fromDate) && (!toDate || invoice.invoice_date <= toDate);
  }), [fromDate, invoices, projectId, query, status, supplierId, toDate]);
  const clearFilters = () => { setQuery(""); setStatus(""); setSupplierId(""); setProjectId(""); setFromDate(""); setToDate(""); };
  const statusValue = status.split(":")[1] as PurchaseInvoiceStatus | PurchasePaymentStatus | undefined;
  const statusText = status.startsWith("document:") ? documentLabel[statusValue as PurchaseInvoiceStatus] : paymentLabel[statusValue as PurchasePaymentStatus];

  return <>
    <div className="mb-3 flex flex-wrap gap-2">
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search purchase invoices…" aria-label="Search purchase invoices" /></div>
      <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} aria-label="Filter by supplier" className="h-9 min-w-44 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm"><option value="">All suppliers</option>{supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Filter by project" className="h-9 min-w-44 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm"><option value="">All projects</option>{projectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Invoice date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Invoice date to" className="w-38" />
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter invoices" className="h-9 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm"><option value="">All statuses</option><optgroup label="Document"><option value="document:draft">Draft</option><option value="document:posted">Posted</option><option value="document:void">Void</option></optgroup><optgroup label="Payment"><option value="payment:unpaid">Unpaid</option><option value="payment:partially_paid">Partially Paid</option><option value="payment:paid">Paid</option><option value="payment:overdue">Overdue</option></optgroup></select>
    </div>
    {(supplierId || projectId || fromDate || toDate || status) && <div className="mb-3 flex flex-wrap gap-2">
      {supplierId && <FilterChip onRemove={() => setSupplierId("")}>Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}</FilterChip>}
      {projectId && <FilterChip onRemove={() => setProjectId("")}>Project: {projectOptions.find(([id]) => id === projectId)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusText}</FilterChip>}
    </div>}
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[1080px]"><thead><tr><th>Bill</th><th>Supplier</th><th>Supplier invoice</th><th>Date</th><th>Due</th><th className="text-right!">Total</th><th className="text-right!">Balance</th><th>Payment</th><th>Document</th></tr></thead><tbody>{rows.map((invoice) => <tr key={invoice.id}><td><Link href={`/b/${businessId}/purchases/invoices/${invoice.id}`} className="tabular font-medium text-primary hover:underline">{invoice.internal_number}</Link></td><td>{invoice.supplier_name}</td><td className="tabular text-muted-foreground">{invoice.supplier_invoice_number}</td><td>{formatDate(invoice.invoice_date)}</td><td>{formatDate(invoice.due_date)}</td><td className="money text-right">{formatMoney(invoice.total_minor, invoice.currency_code, invoice.currency_minor_unit)}</td><td className="money text-right">{invoice.document_status === "posted" ? formatMoney(invoice.balanceMinor, invoice.currency_code, invoice.currency_minor_unit) : "—"}</td><td>{invoice.paymentStatus ? <Badge tone={paymentTone[invoice.paymentStatus]}>{paymentLabel[invoice.paymentStatus]}</Badge> : "—"}</td><td><Badge tone={documentTone[invoice.document_status]}>{documentLabel[invoice.document_status]}</Badge></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No purchase invoices match</p><p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p><Button variant="ghost" className="mt-2" onClick={clearFilters}>Clear filters</Button></div>}
  </>;
}
