"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useColumns } from "@/components/columns-dropdown";
import { formatDate, formatMoney } from "@/core/format";
import type { SalesOrderStatus } from "./sales-order-service";

type Row = {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  date: string;
  expected_date: string | null;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  documentStatus: SalesOrderStatus;
  projectIds: string[];
  projectNames: string[];
};

const COLUMN_LABELS: Record<string, string> = {
  expected: "Expected",
  total: "Total",
  status: "Status",
};

export function SalesOrderTable({
  businessId,
  orders,
  serverSnapshot,
}: {
  businessId: string;
  orders: Row[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const customerOptions = useMemo(
    () =>
      Array.from(new Map(orders.map((order) => [order.customer_id, order.customer_name])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [orders],
  );
  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          orders.flatMap((order) => order.projectIds.map((id, index) => [id, order.projectNames[index] ?? id] as const)),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [orders],
  );
  const { columns, dropdown } = useColumns({
    storageKey: "sales-orders",
    businessId,
    serverSnapshot,
    initial: { expected: true, total: true, status: true },
    labels: COLUMN_LABELS,
  });
  const rows = useMemo(
    () =>
      orders.filter((order) => {
        const matchesQuery = `${order.order_number} ${order.customer_name}`.toLowerCase().includes(query.trim().toLowerCase());
        return (
          (!status || order.documentStatus === status) &&
          (!customerId || order.customer_id === customerId) &&
          (!projectId || order.projectIds.includes(projectId)) &&
          matchesQuery
        );
      }),
    [orders, projectId, query, status, customerId],
  );
  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setCustomerId("");
    setProjectId("");
  };
  const hasActiveFilter = Boolean(customerId || projectId || status || query);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search sales orders…" ariaLabel="Search sales orders" />
        <ToolbarSelect
          value={customerId}
          onChange={setCustomerId}
          ariaLabel="Filter by customer"
          className="min-w-44"
          options={[{ value: "", label: "All customers" }, ...customerOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={projectId}
          onChange={setProjectId}
          ariaLabel="Filter by project"
          className="min-w-44"
          options={[{ value: "", label: "All projects" }, ...projectOptions.map(([id, name]) => ({ value: id, label: name }))]}
        />
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "issued", label: "Issued" },
            { value: "closed", label: "Closed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        {dropdown}
      </ListToolbar>
      {hasActiveFilter && (
        <ListToolbar>
          {customerId && (
            <FilterChip onRemove={() => setCustomerId("")}>
              Customer: {customerOptions.find(([id]) => id === customerId)?.[1]}
            </FilterChip>
          )}
          {projectId && (
            <FilterChip onRemove={() => setProjectId("")}>
              Project: {projectOptions.find(([id]) => id === projectId)?.[1]}
            </FilterChip>
          )}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ListToolbar>
      )}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[780px]">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                {columns.expected && <th>Expected</th>}
                {columns.total && <th className="text-right!">Total</th>}
                {columns.status && <th>Status</th>}
                <th className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      href={`/b/${businessId}/sales/orders/${order.id}`}
                      className="tabular font-medium text-primary hover:underline"
                    >
                      {order.order_number}
                    </Link>
                  </td>
                  <td>{order.customer_name}</td>
                  <td>{formatDate(order.date)}</td>
                  {columns.expected && <td>{order.expected_date ? formatDate(order.expected_date) : "—"}</td>}
                  {columns.total && (
                    <td className="money text-right">
                      {formatMoney(order.total_minor, order.currency_code, order.currency_minor_unit)}
                    </td>
                  )}
                  {columns.status && <td><StatusBadge status={order.documentStatus} /></td>}
                  <td>
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/b/${businessId}/sales/orders/${order.id}`} aria-label={`Open ${order.order_number}`}>
                        <MoreHorizontal className="size-4" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-10 text-center">
          <p className="font-medium">No sales orders match</p>
          <p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p>
          <Button variant="ghost" className="mt-2" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </>
  );
}
