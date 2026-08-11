"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/core/format";

type SupplierRow = {
  id: string; name: string; email: string | null; is_active: number;
  total_purchased_minor: number; total_paid_minor: number;
};

export function SupplierTable({ businessId, currency, suppliers }: { businessId: string; currency: string; suppliers: SupplierRow[] }) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const rows = useMemo(() => suppliers.filter((supplier) => {
    const matches = `${supplier.name} ${supplier.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (!activeOnly || supplier.is_active === 1);
  }), [activeOnly, query, suppliers]);
  return <>
    <div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers…" aria-label="Search suppliers" /></div><Button type="button" variant={activeOnly ? "primary" : "secondary"} onClick={() => setActiveOnly((value) => !value)}>Active only</Button></div>
    {(query || activeOnly) && <FilterChip className="mb-3" onRemove={() => { setQuery(""); setActiveOnly(false); }}>Clear filters</FilterChip>}
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[720px]"><thead><tr><th>Name</th><th>Email</th><th className="text-right!">Outstanding</th><th>Status</th></tr></thead><tbody>{rows.map((supplier) => <tr key={supplier.id}><td><Link href={`/b/${businessId}/suppliers/${supplier.id}`} className="font-medium text-primary hover:underline">{supplier.name}</Link></td><td className="text-muted-foreground">{supplier.email || "—"}</td><td className="money text-right">{formatMoney(Math.max(0, supplier.total_purchased_minor - supplier.total_paid_minor), currency)}</td><td><Badge tone={supplier.is_active ? "success" : "neutral"}>{supplier.is_active ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No suppliers match these filters</p><p className="mt-1 text-sm text-muted-foreground">Clear the filters or add a new supplier.</p></div>}
  </>;
}
