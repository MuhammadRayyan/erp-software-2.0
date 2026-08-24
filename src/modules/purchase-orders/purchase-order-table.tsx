"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/core/format";
import type { PurchaseOrderStatus } from "./purchase-order-service";

type Row = { id: string; order_number: string; supplier_id: string; supplier_name: string; date: string; expected_date: string | null; total_minor: number; currency_code: string; currency_minor_unit: number; status: PurchaseOrderStatus; projectIds: string[]; projectNames: string[] };

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
    <ListToolbar>
      <SearchInput value={query} onChange={setQuery} placeholder="Search purchase orders…" ariaLabel="Search purchase orders" />
      <ToolbarSelect value={supplierId} onChange={setSupplierId} ariaLabel="Filter by supplier" className="min-w-44" options={[{ value: "", label: "All suppliers" }, ...supplierOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <ToolbarSelect value={projectId} onChange={setProjectId} ariaLabel="Filter by project" className="min-w-44" options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]} />
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Order date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Order date to" className="w-38" />
      <ToolbarSelect value={status} onChange={setStatus} ariaLabel="Filter by status" options={[{ value: "", label: "All statuses" }, { value: "draft", label: "Draft" }, { value: "issued", label: "Issued" }, { value: "closed", label: "Closed" }, { value: "cancelled", label: "Cancelled" }]} />
    </ListToolbar>
    {(supplierId || projectId || fromDate || toDate || status) && <ListToolbar>
      {supplierId && <FilterChip onRemove={() => setSupplierId("")}>Supplier: {supplierOptions.find(([id]) => id === supplierId)?.[1]}</FilterChip>}
      {projectId && <FilterChip onRemove={() => setProjectId("")}>Project: {projectOptions.find(([id]) => id === projectId)?.[1]}</FilterChip>}
      {fromDate && <FilterChip onRemove={() => setFromDate("")}>From: {formatDate(fromDate)}</FilterChip>}
      {toDate && <FilterChip onRemove={() => setToDate("")}>To: {formatDate(toDate)}</FilterChip>}
      {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
    </ListToolbar>}
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[780px]"><thead><tr><th>Order</th><th>Supplier</th><th>Date</th><th>Expected</th><th className="text-right!">Total</th><th>Status</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><Link className="tabular font-medium text-primary hover:underline" href={`/b/${businessId}/purchases/orders/${order.id}`}>{order.order_number}</Link></td><td>{order.supplier_name}</td><td>{formatDate(order.date)}</td><td>{order.expected_date ? formatDate(order.expected_date) : "—"}</td><td className="money text-right">{formatMoney(order.total_minor, order.currency_code, order.currency_minor_unit)}</td><td><StatusBadge status={order.status} /></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No purchase orders match</p><p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p><Button variant="ghost" className="mt-2" onClick={clearFilters}>Clear filters</Button></div>}
  </>;
}
