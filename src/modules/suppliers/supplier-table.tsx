"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Columns3, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";
import { ListToolbar, SearchInput } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";
import { formatMoney } from "@/core/format";

type SupplierRow = {
  id: string; name: string; email: string | null; is_active: number;
  total_purchased_minor: number; total_paid_minor: number;
};

const baseColumnLabels: Record<string, string> = { email: "Email", outstanding: "Outstanding", status: "Status" };

export function SupplierTable({ businessId, currency, suppliers, customFields = [], customValues = {}, serverSnapshot }: { businessId: string; currency: string; suppliers: SupplierRow[]; customFields?: CustomFieldColumn[]; customValues?: Record<string, Record<string, string>>; serverSnapshot?: ColumnVisibility }) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  // Memoized so the shared visibility hook sees a stable defaults reference.
  const initialColumns = useMemo(
    () => ({
      email: true,
      outstanding: true,
      status: true,
      ...Object.fromEntries(customFields.map((field) => [field.id, true])),
    }),
    [customFields],
  );
  const { visibility: columns, toggle: toggleColumn } = useColumnVisibility("suppliers", initialColumns, { businessId, serverSnapshot });
  const columnLabel = (column: string) => baseColumnLabels[column] ?? customFields.find((field) => field.id === column)?.name ?? column;
  const rows = useMemo(() => suppliers.filter((supplier) => {
    const matches = `${supplier.name} ${supplier.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (!activeOnly || supplier.is_active === 1);
  }), [activeOnly, query, suppliers]);
  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search suppliers…" ariaLabel="Search suppliers" />
        <Button type="button" variant={activeOnly ? "primary" : "secondary"} onClick={() => setActiveOnly((value) => !value)}><Filter className="size-4" /> Active only</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="secondary"><Columns3 className="size-4" /> Columns</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">{Object.entries(columns).map(([column, visible]) => <DropdownMenuItem key={column} onSelect={(event) => { event.preventDefault(); toggleColumn(column); }}><span className="w-4">{visible ? "✓" : ""}</span>{columnLabel(column)}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
      </ListToolbar>
      {(query || activeOnly) && <div className="mb-3"><FilterChip onRemove={() => { setQuery(""); setActiveOnly(false); }}>Clear filters</FilterChip></div>}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <thead><tr><th>Name</th>{columns.email && <th>Email</th>}{columns.outstanding && <th className="text-right!">Outstanding</th>}{columns.status && <th>Status</th>}{customFields.map((field) => columns[field.id] && <th key={field.id}>{field.name}</th>)}</tr></thead>
            <tbody>{rows.map((supplier) => <tr key={supplier.id} className={supplier.is_active ? "" : "opacity-60"}><td><Link href={`/b/${businessId}/suppliers/${supplier.id}`} className="font-medium text-primary hover:underline">{supplier.name}</Link></td>{columns.email && <td className="text-muted-foreground">{supplier.email || "—"}</td>}{columns.outstanding && <td className="money text-right">{formatMoney(Math.max(0, supplier.total_purchased_minor - supplier.total_paid_minor), currency)}</td>}{columns.status && <td><Badge tone={supplier.is_active ? "success" : "neutral"}>{supplier.is_active ? "Active" : "Inactive"}</Badge></td>}{customFields.map((field) => columns[field.id] && <td key={field.id} className="text-muted-foreground">{formatCustomFieldValue(field.fieldType, customValues[supplier.id]?.[field.id])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="p-10 text-center"><p className="font-medium">No suppliers match these filters</p><p className="mt-1 text-sm text-muted-foreground">Clear the search or active-status filter.</p><Button variant="ghost" className="mt-2" onClick={() => { setQuery(""); setActiveOnly(false); }}>Clear filters</Button></div>
      )}
    </>
  );
}
