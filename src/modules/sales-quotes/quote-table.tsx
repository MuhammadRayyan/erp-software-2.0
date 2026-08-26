"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import type { SalesQuoteStatus } from "./quote-service";

type Row = { id: string; quote_number: string; customer_id: string; customer_name: string; date: string; expected_date: string | null; total_minor: number; currency_code: string; currency_minor_unit: number; documentStatus: SalesQuoteStatus; projectIds: string[]; projectNames: string[] };

export function SalesQuoteTable({ businessId, quotes }: { businessId: string; quotes: Row[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const customerOptions = useMemo(
    () => Array.from(new Map(quotes.map((quote) => [quote.customer_id, quote.customer_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [quotes],
  );
  const projectOptions = useMemo(() => Array.from(new Map(quotes.flatMap((quote) => quote.projectIds.map((id, index) => [id, quote.projectNames[index] ?? id] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1])), [quotes]);
  const rows = useMemo(() => quotes.filter((quote) => (
    (!status || quote.documentStatus === status)
    && (!customerId || quote.customer_id === customerId)
    && (!projectId || quote.projectIds.includes(projectId))
    && (!fromDate || quote.date >= fromDate)
    && (!toDate || quote.date <= toDate)
    && `${quote.quote_number} ${quote.customer_name}`.toLowerCase().includes(query.trim().toLowerCase())
  )), [fromDate, quotes, projectId, query, status, customerId, toDate]);
  const clearFilters = () => { setQuery(""); setStatus(""); setCustomerId(""); setProjectId(""); setFromDate(""); setToDate(""); };

  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={setQuery} placeholder="Search purchase quotes…" ariaLabel="Search purchase quotes" />
      <ToolbarSelect value={customerId} onChange={setCustomerId} ariaLabel="Filter by customer" className="min-w-44" options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <ToolbarSelect value={projectId} onChange={setProjectId} ariaLabel="Filter by project" className="min-w-44" options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Quote date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Quote date to" className="w-38" />
      <ToolbarSelect value={status} onChange={setStatus} ariaLabel="Filter by status" options={[{ value: "", label: "All statuses" }, { value: "draft", label: "Draft" }, { value: "issued", label: "Issued" }, { value: "closed", label: "Closed" }, { value: "cancelled", label: "Cancelled" }]} />
    </ListToolbar>
    {(customerId || projectId || fromDate || toDate || status) && <ListToolbar>
      {customerId && <FilterChip onRemove={() => setCustomerId("")}>Customer: {customerOptions.find(([id]) => id === customerId)?.[1]}</FilterChip>}
      {projectId && <FilterChip onRemove={() => setProjectId("")}>Project: {projectOptions.find(([id]) => id === projectId)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
    </ListToolbar>}
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[780px]"><thead><tr><th>Quote</th><th>Customer</th><th>Date</th><th>Expected</th><th className="text-right!">Total</th><th>Status</th></tr></thead><tbody>{rows.map((quote) => <tr key={quote.id}><td><Link className="tabular font-medium text-primary hover:underline" href={`/b/${businessId}/purchases/quotes/${quote.id}`}>{quote.quote_number}</Link></td><td>{quote.customer_name}</td><td>{formatDate(quote.date)}</td><td>{quote.expected_date ? formatDate(quote.expected_date) : "—"}</td><td className="money text-right">{formatMoney(quote.total_minor, quote.currency_code, quote.currency_minor_unit)}</td><td><StatusBadge status={quote.documentStatus} /></td></tr>)}</tbody></table></div> : <div className="rounded-lg bquote bquote-bquote bg-surface py-10 text-center"><p className="font-medium">No purchase quotes match</p><p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p><Button variant="ghost" className="mt-2" onClick={clearFilters}>Clear filters</Button></div>}
  </>;
}
