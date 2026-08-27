"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { ListToolbar, SearchInput, ToolbarSelect } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { useColumns } from "@/components/columns-dropdown";
import { formatDate, formatMoney } from "@/core/format";
import type { DebitNoteStatus } from "./debit-note-service";

type Row = {
  id: string;
  debit_note_number: string;
  supplier_id: string;
  supplier_name: string;
  debit_note_date: string;
  reference: string | null;
  document_status: DebitNoteStatus;
  total_minor: number;
  currency_code: string;
  currency_minor_unit: number;
  projectIds: string[];
  projectNames: string[];
};

const COLUMN_LABELS: Record<string, string> = {
  reference: "Reference",
  total: "Total",
  status: "Status",
};

export function DebitNoteTable({
  businessId,
  debitNotes,
  serverSnapshot,
}: {
  businessId: string;
  debitNotes: Row[];
  serverSnapshot?: import("@/components/use-column-visibility").ColumnVisibility;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [projectId, setProjectId] = useState("");
  const projects = useMemo(() => {
    const choices = new Map<string, string>();
    debitNotes.forEach((note) =>
      note.projectIds.forEach((id, index) => choices.set(id, note.projectNames[index] ?? id)),
    );
    return Array.from(choices, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [debitNotes]);
  const { columns, dropdown } = useColumns({
    storageKey: "debit-notes",
    businessId,
    serverSnapshot,
    initial: { reference: true, total: true, status: true },
    labels: COLUMN_LABELS,
  });
  const rows = useMemo(
    () =>
      debitNotes.filter(
        (note) =>
          (!status || note.document_status === status) &&
          (!projectId || note.projectIds.includes(projectId)) &&
          `${note.debit_note_number} ${note.supplier_name}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [debitNotes, projectId, query, status],
  );
  const clearFilters = () => {
    setQuery("");
    setStatus("");
    setProjectId("");
  };
  const hasActiveFilter = Boolean(projectId || status || query);

  return (
    <>
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search debit notes…" ariaLabel="Search debit notes" />
        <ToolbarSelect
          value={projectId}
          onChange={setProjectId}
          ariaLabel="Filter by project"
          options={[{ value: "", label: "All projects" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
        />
        <ToolbarSelect
          value={status}
          onChange={setStatus}
          ariaLabel="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "draft", label: "Draft" },
            { value: "posted", label: "Posted" },
            { value: "void", label: "Void" },
          ]}
        />
        {dropdown}
      </ListToolbar>
      {hasActiveFilter && (
        <ListToolbar>
          {projectId && (
            <FilterChip onRemove={() => setProjectId("")}>
              Project: {projects.find((p) => p.id === projectId)?.name}
            </FilterChip>
          )}
          {status && <FilterChip onRemove={() => setStatus("")}>Status: {status}</FilterChip>}
          {query && <FilterChip onRemove={() => setQuery("")}>Search: {query}</FilterChip>}
        </ListToolbar>
      )}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>Debit Note</th>
                <th>Supplier</th>
                <th>Date</th>
                {columns.reference && <th>Reference</th>}
                {columns.total && <th className="text-right!">Total</th>}
                {columns.status && <th>Status</th>}
                <th className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((note) => (
                <tr key={note.id}>
                  <td>
                    <Link
                      href={`/b/${businessId}/purchases/debit-notes/${note.id}`}
                      className="tabular font-medium text-primary hover:underline"
                    >
                      {note.debit_note_number}
                    </Link>
                  </td>
                  <td>{note.supplier_name}</td>
                  <td>{formatDate(note.debit_note_date)}</td>
                  {columns.reference && <td className="text-muted-foreground">{note.reference ?? "—"}</td>}
                  {columns.total && (
                    <td className="money text-right">
                      {formatMoney(note.total_minor, note.currency_code, note.currency_minor_unit)}
                    </td>
                  )}
                  {columns.status && <td><StatusBadge status={note.document_status} /></td>}
                  <td>
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/b/${businessId}/purchases/debit-notes/${note.id}`} aria-label={`Open ${note.debit_note_number}`}>
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
          <p className="font-medium">No debit notes match</p>
          <p className="mt-1 text-sm text-muted-foreground">Adjust the search or filters.</p>
          <Button variant="ghost" className="mt-2" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </>
  );
}
