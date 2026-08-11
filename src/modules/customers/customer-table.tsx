"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Columns3, Filter, MoreHorizontal, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";

type CustomerRow = { id: string; name: string; email: string | null; phone: string | null; status: "active" | "archived" };

export function CustomerTable({ businessId, customers }: { businessId: string; customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [columns, setColumns] = useState({ email: true, phone: true, status: true });
  const rows = useMemo(() => customers.filter((customer) => (!activeOnly || customer.status === "active") && [customer.name, customer.email, customer.phone].some((value) => value?.toLowerCase().includes(query.toLowerCase().trim()))), [customers, query, activeOnly]);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers…" className="pl-9" aria-label="Search customers" /></div><Button variant="secondary" onClick={() => setActiveOnly((value) => !value)}><Filter className="size-4" /> Filter</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary"><Columns3 className="size-4" /> Columns</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{Object.entries(columns).map(([column, visible]) => <DropdownMenuItem key={column} onSelect={(event) => { event.preventDefault(); setColumns((current) => ({ ...current, [column]: !visible })); }}><span className="w-4">{visible ? "✓" : ""}</span>{column[0].toUpperCase() + column.slice(1)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>
      {activeOnly && <div className="mb-3"><FilterChip onRemove={() => setActiveOnly(false)}>Status: Active</FilterChip></div>}
      {rows.length === 0 ? <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No customers match these filters</p><p className="mt-1 text-sm text-muted-foreground">Clear the search or active-status filter.</p><Button variant="ghost" className="mt-2" onClick={() => { setQuery(""); setActiveOnly(false); }}>Clear filters</Button></div> : <div className="data-panel overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th>{columns.email && <th>Email</th>}{columns.phone && <th>Phone</th>}{columns.status && <th>Status</th>}<th className="w-12"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((customer) => <tr key={customer.id}><td><Link className="font-medium text-primary hover:underline" href={`/b/${businessId}/customers/${customer.id}`}>{customer.name}</Link></td>{columns.email && <td className="text-muted-foreground">{customer.email || "—"}</td>}{columns.phone && <td className="text-muted-foreground">{customer.phone || "—"}</td>}{columns.status && <td><Badge tone={customer.status === "active" ? "success" : "neutral"}>{customer.status === "active" ? "Active" : "Archived"}</Badge></td>}<td><Button asChild variant="ghost" size="icon"><Link href={`/b/${businessId}/customers/${customer.id}`} aria-label={`Open ${customer.name}`}><MoreHorizontal className="size-4" /></Link></Button></td></tr>)}</tbody></table></div>}
    </>
  );
}
