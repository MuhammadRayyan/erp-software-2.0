"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Columns3, Filter, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useColumnVisibility, type ColumnVisibility } from "@/components/use-column-visibility";
import { ListToolbar, SearchInput } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { formatCustomFieldValue, type CustomFieldColumn } from "@/modules/custom-fields/custom-field-display";

type CustomerRow = { id: string; name: string; email: string | null; phone: string | null; isActive: boolean; };

const baseColumnLabels: Record<string, string> = { email: "Email", phone: "Phone", status: "Status" };

export function CustomerTable({ businessId, customers, customFields = [], customValues = {}, serverSnapshot }: { businessId: string; customers: CustomerRow[]; customFields?: CustomFieldColumn[]; customValues?: Record<string, Record<string, string>>; serverSnapshot?: ColumnVisibility }) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  // Memoized so the shared visibility hook sees a stable defaults reference.
  const initialColumns = useMemo(
    () => ({
      email: true,
      phone: true,
      status: true,
      ...Object.fromEntries(customFields.map((field) => [field.id, true])),
    }),
    [customFields],
  );
  const { visibility: columns, toggle: toggleColumn } = useColumnVisibility("customers", initialColumns, { businessId, serverSnapshot });
  const columnLabel = (column: string) => baseColumnLabels[column] ?? customFields.find((field) => field.id === column)?.name ?? column;
  const rows = useMemo(() => customers.filter((customer) => (!activeOnly || customer.isActive) && [customer.name, customer.email, customer.phone].some((value) => value?.toLowerCase().includes(query.toLowerCase().trim()))), [customers, query, activeOnly]);
  return (
    <>
      <ListToolbar><SearchInput value={query} onChange={setQuery} placeholder="Search customers…" ariaLabel="Search customers" /><Button type="button" variant={activeOnly ? "primary" : "secondary"} onClick={() => setActiveOnly((value) => !value)}><Filter className="size-4" /> Active only</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary"><Columns3 className="size-4" /> Columns</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{Object.entries(columns).map(([column, visible]) => <DropdownMenuItem key={column} onSelect={(event) => { event.preventDefault(); toggleColumn(column); }}><span className="w-4">{visible ? "✓" : ""}</span>{columnLabel(column)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></ListToolbar>
      {(query || activeOnly) && <div className="mb-3"><FilterChip onRemove={() => { setQuery(""); setActiveOnly(false); }}>Clear filters</FilterChip></div>}
      {rows.length === 0 ? <div className="p-10 text-center"><p className="font-medium">No customers match these filters</p><p className="mt-1 text-sm text-muted-foreground">Clear the search or active-status filter.</p><Button variant="ghost" className="mt-2" onClick={() => { setQuery(""); setActiveOnly(false); }}>Clear filters</Button></div> : <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th>{columns.email && <th>Email</th>}{columns.phone && <th>Phone</th>}{columns.status && <th>Status</th>}{customFields.map((field) => columns[field.id] && <th key={field.id}>{field.name}</th>)}<th className="w-12"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((customer) => <tr key={customer.id} className={!customer.isActive ? "opacity-60" : ""}><td><Link className="font-medium text-primary hover:underline" href={`/b/${businessId}/customers/${customer.id}`}>{customer.name}</Link></td>{columns.email && <td className="text-muted-foreground">{customer.email || "—"}</td>}{columns.phone && <td className="text-muted-foreground">{customer.phone || "—"}</td>}{columns.status && <td><Badge tone={customer.isActive ? "success" : "neutral"}>{customer.isActive ? "Active" : "Inactive"}</Badge></td>}{customFields.map((field) => columns[field.id] && <td key={field.id} className="text-muted-foreground">{formatCustomFieldValue(field.fieldType, customValues[customer.id]?.[field.id])}</td>)}<td><Button asChild variant="ghost" size="icon"><Link href={`/b/${businessId}/customers/${customer.id}`} aria-label={`Open ${customer.name}`}><MoreHorizontal className="size-4" /></Link></Button></td></tr>)}</tbody></table></div>}
    </>
  );
}
