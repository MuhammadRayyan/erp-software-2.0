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
import type { PurchaseQuoteStatus } from "./purchase-quote-service";

type Row = {
  id: string;
  quote_number: string;
  revision_number?: number;
  is_latest_revision?: number;
  supplier_id: string;
  supplier_name: string;
  date: string;
  expected_date: string | null;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  documentStatus: PurchaseQuoteStatus;
  projectIds: string[];
  projectNames: string[];
};

const COLUMN_LABELS: Record<string, string> = {
  expected: "Expiry Date",
  total: "Total",
  status: "Status",
};

export function PurchaseQuoteTable({
  businessId,
  quotes,
  serverSnapshot,
}: {
  businessId: string;
  quotes: Row[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [projectId, setProjectId] = useState("");

  const supplierOptions = useMemo(
    () =>
      Array.from(new Map(quotes.map((quote) => [quote.supplier_id, quote.supplier_name])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [quotes],
  );

  const projectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          quotes.flatMap((quote) => quote.projectIds.map((id, index) => [id, quote.projectNames[index] ?? id] as const)),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [quotes],
  );

  const initialColumns = useMemo(
    () => ({ expected: true, total: true, status: true }),
    [],
  );

  const { columns, dropdown } = useColumns({
    storageKey: "purchase-quotes",
    businessId,
    serverSnapshot,
    initial: initialColumns,
    labels: COLUMN_LABELS,
  });

  const rows = useMemo(
    () =>
      quotes.filter((quote) => {
        const matchesQuery = `${quote.quote_number} ${quote.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase());
        return (
          (!status || quote.documentStatus === status) &&
          (!supplierId || quote.supplier_id === supplierId) &&
          (!projectId || quote.projectIds.includes(projectId)) &&
          matchesQuery
        );
      }),
    [quotes, projectId, query, status, supplierId],
  );

  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setSupplierId("");
    setProjectId("");
  };

  const hasActiveFilter = Boolean(supplierId || projectId || status || query);

  return (
    <>
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search purchase quotes…"
          ariaLabel="Search purchase quotes"
        />
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
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Issued / Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "superseded", label: "Superseded" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        {dropdown}
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
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {statusLabel(status)}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ListToolbar>
      )}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[780px]">
            <thead>
              <tr>
                <th>Quote Number</th>
                <th>Supplier</th>
                <th>Quote Date</th>
                {columns.expected && <th>Expiry Date</th>}
                {columns.total && <th className="text-right!">Total</th>}
                {columns.status && <th>Status</th>}
                <th className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/b/${businessId}/purchases/quotes/${quote.id}`}
                        className="tabular font-medium text-primary hover:underline"
                      >
                        {quote.quote_number}
                      </Link>
                      {quote.revision_number !== undefined && quote.revision_number > 0 && (
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          Rev {quote.revision_number}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{quote.supplier_name}</td>
                  <td>{formatDate(quote.date)}</td>
                  {columns.expected && <td>{quote.expected_date ? formatDate(quote.expected_date) : "—"}</td>}
                  {columns.total && (
                    <td className="money text-right">
                      {formatMoney(quote.total_minor, quote.currency_code, quote.currency_minor_unit)}
                    </td>
                  )}
                  {columns.status && (
                    <td>
                      <StatusBadge status={quote.documentStatus} />
                    </td>
                  )}
                  <td>
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/b/${businessId}/purchases/quotes/${quote.id}`} aria-label={`Open ${quote.quote_number}`}>
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
          <p className="font-medium">No purchase quotes match</p>
          <p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p>
          <Button variant="ghost" className="mt-2" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </>
  );
}
