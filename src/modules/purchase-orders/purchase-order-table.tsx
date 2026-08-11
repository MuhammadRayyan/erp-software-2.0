"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import type { PurchaseOrderStatus } from "./purchase-order-service";

type Row = { id: string; order_number: string; supplier_id: string; supplier_name: string; date: string; expected_date: string | null; total_minor: number; currency_code: string; currency_minor_unit: number; status: PurchaseOrderStatus; projectIds: string[]; projectNames: string[] };
const tones = { draft: "neutral", issued: "info", closed: "success", cancelled: "danger" } as const;
const statusLabels = { draft: "Draft", issued: "Issued", closed: "Closed", cancelled: "Cancelled" };

export function PurchaseOrderTable({ businessId, orders }: { businessId: string; orders: Row[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const supplierOptions = useMemo(
    () => Array.from(new Map(orders.map((order) => [order.supplier_id, order.supplier_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])),
    [orders],
  );
  const projectOptions = useMemo(() => Array.from(new Map(orders.flatMap((order) => order.projectIds.map((id, index) => [id, order.projectNames[index] ?? id] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1])), [orders]);
  const rows = useMemo(() => orders.filter((order) => (
    (!status || order.status === status)
    && (!supplierId || order.supplier_id === supplierId)
    && (!projectId || order.projectIds.includes(projectId))
    && (!fromDate || order.date >= fromDate)
    && (!toDate || order.date <= toDate)
    && `${order.order_number} ${order.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase())
  )), [fromDate, orders, projectId, query, status, supplierId, toDate]);
  const clearFilters = () => { setQuery(""); setStatus(""); setSupplierId(""); setProjectId(""); setFromDate(""); setToDate(""); };

  return <>
    <div className="mb-3 flex flex-wrap gap-2">
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search purchase orders…" aria-label="Search purchase orders" /></div>
      <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} aria-label="Filter by supplier" className="h-9 min-w-44 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm"><option value="">All suppliers</option>{supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Filter by project" className="h-9 min-w-44 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm"><option value="">All projects</option>{projectOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Order date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Order date to" className="w-38" />
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="h-9 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm"><option value="">All statuses</option><option value="draft">Draft</option><option value="issued">Issued</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option></select>
    </div>
    {(supplierId || projectId || fromDate || toDate || status) && <div className="mb-3 flex flex-wrap gap-2">
      {supplierId && <FilterChip onRemove={() => setSupplierId("")}>Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}</FilterChip>}
      {projectId && <FilterChip onRemove={() => setProjectId("")}>Project: {projectOptions.find(([id]) => id === projectId)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabels[status as PurchaseOrderStatus]}</FilterChip>}
    </div>}
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[780px]"><thead><tr><th>Order</th><th>Supplier</th><th>Date</th><th>Expected</th><th className="text-right!">Total</th><th>Status</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><Link className="tabular font-medium text-primary hover:underline" href={`/b/${businessId}/purchases/orders/${order.id}`}>{order.order_number}</Link></td><td>{order.supplier_name}</td><td>{formatDate(order.date)}</td><td>{order.expected_date ? formatDate(order.expected_date) : "—"}</td><td className="money text-right">{formatMoney(order.total_minor, order.currency_code, order.currency_minor_unit)}</td><td><Badge tone={tones[order.status]}>{statusLabels[order.status]}</Badge></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No purchase orders match</p><p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p><Button variant="ghost" className="mt-2" onClick={clearFilters}>Clear filters</Button></div>}
  </>;
}
