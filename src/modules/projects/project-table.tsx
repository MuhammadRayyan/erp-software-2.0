"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/core/format";
import type { ProjectListRow } from "./project-service";
import { ProjectStatusBadge } from "./project-status";

export function ProjectTable({ businessId, currency, projects }: { businessId: string; currency: string; projects: ProjectListRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const customers = useMemo(() => Array.from(new Map(projects.flatMap((project) => project.customerId && project.customerName ? [[project.customerId, project.customerName] as const] : [])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [projects]);
  const rows = useMemo(() => projects.filter((project) => {
    const text = `${project.code} ${project.name} ${project.customerName ?? ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (!status || project.status === status) && (!customerId || project.customerId === customerId) && (!fromDate || (project.startDate ?? "") >= fromDate) && (!toDate || (project.targetEndDate ?? "9999-12-31") <= toDate);
  }), [customerId, fromDate, projects, query, status, toDate]);
  const clear = () => { setQuery(""); setStatus(""); setCustomerId(""); setFromDate(""); setToDate(""); };
  return <>
    <div className="mb-3 flex flex-wrap gap-2">
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" aria-label="Search projects" /></div>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm" aria-label="Filter by project status"><option value="">All statuses</option><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On Hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
      <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="h-9 min-w-44 rounded-[6px] border border-border-strong bg-surface-raised px-3 text-sm" aria-label="Filter by customer"><option value="">All customers</option>{customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Project start date from" className="w-38" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Project target end date to" className="w-38" />
    </div>
    {(status || customerId || fromDate || toDate) && <div className="mb-3 flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={clear}><X className="size-3" /> Clear filters</Button></div>}
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[860px]"><thead><tr><th>Project</th><th>Customer</th><th>Status</th><th className="text-right!">Revenue</th><th className="text-right!">Cost</th><th className="text-right!">Profit</th></tr></thead><tbody>{rows.map((project) => <tr key={project.id}><td><Link href={`/b/${businessId}/projects/${project.id}`} className="font-medium text-primary hover:underline"><span className="tabular">{project.code}</span><span className="ml-2 text-foreground">{project.name}</span></Link></td><td>{project.customerName ?? <span className="text-muted-foreground">—</span>}</td><td><ProjectStatusBadge status={project.status} /></td><td className="money text-right">{formatMoney(project.revenueMinor, currency)}</td><td className="money text-right">{formatMoney(project.costMinor, currency)}</td><td className={`money text-right font-medium ${project.profitMinor < 0 ? "text-danger" : ""}`}>{formatMoney(project.profitMinor, currency)}</td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No projects match these filters</p><p className="mt-1 text-sm text-muted-foreground">Try a different project code, customer, status, or date.</p><Button variant="ghost" className="mt-2" onClick={clear}>Clear filters</Button></div>}
  </>;
}
