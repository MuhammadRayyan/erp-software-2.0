"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Columns3, MoreHorizontal } from "lucide-react";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";
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
  invoices: Row[];
  /** Server-loaded snapshot for the "purchase-invoices" storage key. */
  serverSnapshot?: ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");
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
  // Memoized so the shared visibility hook sees a stable defaults reference.
  // All listed columns default to visible — the snapshot only stores
  // explicitly-toggled entries.
  const initialColumns = useMemo(
    () => ({
      supplierInvoice: true,
      date: true,
      due: true,
      total: true,
      balance: true,
      payment: true,
      document: true,
    }),
    [],
  );
  const { visibility: columns, toggle: toggleColumn } = useColumnVisibility("purchase-invoices", initialColumns, {
    businessId,
    serverSnapshot,
  });
  const columnLabel = (column: string) => COLUMN_LABELS[column] ?? column;
  const rows = useMemo(
    () =>
      invoices.filter((invoice) => {
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
      }),
    [invoices, projectId, query, status, supplierId],
  );
  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setSupplierId("");
    setProjectId("");
  };
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
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter invoices"
          className="h-9 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm"
        >
          <option value="">All statuses</option>
          <optgroup label="Document">
            <option value="document:draft">Draft</option>
            <option value="document:posted">Posted</option>
            <option value="document:void">Void</option>
          </optgroup>
          <optgroup label="Payment">
            <option value="payment:unpaid">Unpaid</option>
            <option value="payment:partially_paid">Partially Paid</option>
            <option value="payment:paid">Paid</option>
            <option value="payment:overdue">Overdue</option>
          </optgroup>
        </select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              <Columns3 className="size-4" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.entries(columns).map(([column, visible]) => (
              <DropdownMenuItem
                key={column}
                onSelect={(event) => {
                  event.preventDefault();
                  toggleColumn(column);
                }}
              >
                <span className="w-4">{visible ? "✓" : ""}</span>
                {columnLabel(column)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Supplier</th>
                {columns.supplierInvoice && <th>Supplier invoice</th>}
                {columns.date && <th>Date</th>}
                {columns.due && <th>Due</th>}
                {columns.total && <th className="text-right!">Total</th>}
                {columns.balance && <th className="text-right!">Balance</th>}
                {columns.payment && <th>Payment</th>}
                {columns.document && <th>Document</th>}
                <th className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link href={`/b/${businessId}/purchases/invoices/${invoice.id}`} className="tabular font-medium text-primary hover:underline">
                      {invoice.internal_number}
                    </Link>
                  </td>
                  <td>{invoice.supplier_name}</td>
                  {columns.supplierInvoice && <td className="tabular text-muted-foreground">{invoice.supplier_invoice_number}</td>}
                  {columns.date && <td>{formatDate(invoice.invoice_date)}</td>}
                  {columns.due && <td>{formatDate(invoice.due_date)}</td>}
                  {columns.total && (
                    <td className="money text-right">{formatMoney(invoice.total_minor, invoice.currency_code, invoice.currency_minor_unit)}</td>
                  )}
                  {columns.balance && (
                    <td className="money text-right">
                      {invoice.document_status === "posted" ? formatMoney(invoice.balanceMinor, invoice.currency_code, invoice.currency_minor_unit) : "—"}
                    </td>
                  )}
                  {columns.payment && <td>{invoice.paymentStatus ? <StatusBadge status={invoice.paymentStatus} /> : "—"}</td>}
                  {columns.document && <td><StatusBadge status={invoice.document_status} /></td>}
                  <td>
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/b/${businessId}/purchases/invoices/${invoice.id}`} aria-label={`Open ${invoice.internal_number}`}>
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
          <p className="font-medium">No purchase invoices match</p>
          <p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p>
          <Button variant="ghost" className="mt-2" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </>
  );
}
