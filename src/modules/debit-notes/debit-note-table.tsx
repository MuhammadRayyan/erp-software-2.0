"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { formatDate, formatMoney } from "@/core/format";
import type { DebitNoteStatus } from "./debit-note-service";

type Row = {
  id: string;
  credit_note_number: string;
  supplier_name: string;
  purchase_invoice_id: string;
  invoice_number: string;
  date: string;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  document_status: DebitNoteStatus;
  projectIds: string[];
  projectNames: string[];
};

export function DebitNoteTable({ businessId, debitNotes }: { businessId: string; debitNotes: Row[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState("");
  const projects = useMemo(() => {
    const choices = new Map<string, string>();
    debitNotes.forEach((note) => note.projectIds.forEach((id, index) => choices.set(id, note.projectNames[index] ?? id)));
    return Array.from(choices, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [debitNotes]);
  const rows = useMemo(
    () => debitNotes.filter((note) =>
      (!status || note.document_status === status)
      && (!projectId || note.projectIds.includes(projectId))
      && `${note.credit_note_number} ${note.supplier_name} ${note.invoice_number} ${note.projectNames.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())),
    [debitNotes, projectId, query, status],
  );
  return <>
    <ListToolbar>
      <SearchInput value={query} onChange={setQuery} placeholder="Search debit notes…" ariaLabel="Search debit notes" />
      <ToolbarSelect value={projectId} onChange={setProjectId} ariaLabel="Filter by project" options={[{ value: "", label: "All projects" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} />
      <ToolbarSelect value={status} onChange={setStatus} ariaLabel="Filter by status" options={[{ value: "", label: "All statuses" }, { value: "draft", label: "Draft" }, { value: "posted", label: "Posted" }, { value: "void", label: "Void" }]} />
    </ListToolbar>
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Credit note</th><th>Supplier</th><th>Project</th><th>Invoice</th><th>Date</th><th className="text-right!">Total</th><th>Status</th></tr></thead><tbody>{rows.map((note) => <tr key={note.id}>
      <td><Link href={`/b/${businessId}/sales/debit-notes/${note.id}`} className="tabular font-medium text-primary hover:underline">{note.credit_note_number}</Link></td>
      <td>{note.supplier_name}</td>
      <td>{note.projectIds.length ? note.projectIds.map((id, index) => <span key={id}>{index > 0 && ", "}<Link href={`/b/${businessId}/projects/${id}`} className="text-primary hover:underline">{note.projectNames[index] ?? id}</Link></span>) : <span className="text-muted-foreground">—</span>}</td>
      <td><Link href={`/b/${businessId}/sales/invoices/${note.purchase_invoice_id}`} className="tabular text-primary hover:underline">{note.invoice_number}</Link></td>
      <td>{formatDate(note.date)}</td><td className="money text-right">{formatMoney(note.total_minor, note.currency_code, note.currency_minor_unit)}</td>
      <td><StatusBadge status={note.document_status} /></td>
    </tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No debit notes match</p><p className="mt-1 text-sm text-muted-foreground">Adjust the search, Project, or status filter.</p></div>}
  </>;
}
