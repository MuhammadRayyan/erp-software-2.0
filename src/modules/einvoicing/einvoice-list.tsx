"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatDate, formatDateTime, formatMoney } from "@/core/format";
import type { EInvoiceSourceType, EInvoiceStatus } from "./einvoice-types";
import { EInvoiceStatusBadge } from "./status-badge";
import { SelectNative } from "@/components/ui/select-native";

export type EInvoiceListRow = {
  source_type: EInvoiceSourceType;
  source_id: string;
  document_number: string;
  document_date: string;
  customer_name: string;
  total_minor: number;
  document_id: string | null;
  uuid: string | null;
  specification_version: string | null;
  status: EInvoiceStatus;
  exchange_status: string | null;
  reporting_status: string | null;
  provider_key: string | null;
  provider_environment: string | null;
  updated_at: string;
};


export function EInvoiceList({ businessId, currency, rows }: { businessId: string; currency: string; rows: EInvoiceListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const customers = useMemo(() => [...new Set(rows.map((row) => row.customer_name))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    const needle = query.trim().toLowerCase();
    return (!needle || `${row.document_number} ${row.customer_name} ${row.uuid ?? ""}`.toLowerCase().includes(needle))
      && (status === "all" || row.status === status)
      && (type === "all" || row.source_type === type)
      && (customer === "all" || row.customer_name === customer)
      && (!dateFrom || row.document_date >= dateFrom)
      && (!dateTo || row.document_date <= dateTo);
  }), [customer, dateFrom, dateTo, query, rows, status, type]);
  return <section className="data-panel">
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <label className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" /><span className="sr-only">Search eInvoices</span><input className="h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" placeholder="Search number, customer, or UUID" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <SelectNative aria-label="Filter by document type"  value={type} onChange={(event) => setType(event.target.value)}><option value="all">All document types</option><option value="sales_invoice">Sales Invoices</option><option value="sales_credit_note">Sales Credit Notes</option></SelectNative>
      <SelectNative aria-label="Filter by customer"  value={customer} onChange={(event) => setCustomer(event.target.value)}><option value="all">All customers</option>{customers.map((name) => <option key={name} value={name}>{name}</option>)}</SelectNative>
      <SelectNative aria-label="Filter by status"  value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="NotPrepared">Not Prepared</option><option value="NeedsData">Needs Data</option><option value="ValidationFailed">Validation Failed</option><option value="Ready">Ready</option><option value="Submitted">Submitted</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></SelectNative>
      <input type="date" aria-label="Issue date from" className="h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
      <input type="date" aria-label="Issue date to" className="h-9 w-full rounded-[6px] border border-border-strong bg-surface-raised px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
    </div>
    {filtered.length ? <div className="overflow-x-auto"><table className="data-table min-w-[1180px]"><thead><tr><th>Document</th><th>Customer</th><th>Date</th><th>Status</th><th>Exchange / reporting</th><th>Provider</th><th>Specification</th><th>Last update</th><th className="text-right!">Total</th></tr></thead><tbody>{filtered.map((row) => {
      const sourceHref = row.source_type === "sales_invoice" ? `/b/${businessId}/sales/invoices/${row.source_id}` : `/b/${businessId}/sales/credit-notes/${row.source_id}`;
      const href = row.document_id ? `/b/${businessId}/einvoicing/${row.document_id}` : sourceHref;
      return <tr key={`${row.source_type}-${row.source_id}`}>
        <td><Link href={href} className="font-medium text-primary hover:underline"><span className="tabular">{row.document_number}</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">{row.source_type === "sales_invoice" ? "Sales Invoice" : "Sales Credit Note"}</span></Link></td>
        <td>{row.customer_name}</td><td>{formatDate(row.document_date)}</td><td><EInvoiceStatusBadge status={row.status} /></td>
        <td className="text-sm text-muted-foreground">{row.exchange_status || "—"} / {row.reporting_status || "—"}</td>
        <td className="capitalize">{row.provider_key ? `${row.provider_key} / ${row.provider_environment}` : "—"}</td>
        <td>{row.specification_version ? `PINT-AE ${row.specification_version}` : "—"}</td><td>{formatDateTime(row.updated_at)}</td>
        <td className="money text-right">{formatMoney(row.total_minor, currency)}</td>
      </tr>;
    })}</tbody></table></div> : <div className="p-10 text-center"><p className="font-medium">No eInvoices match these filters</p><p className="mt-1 text-sm text-muted-foreground">Posted Sales Invoices and Sales Credit Notes appear here automatically.</p></div>}
  </section>;
}
