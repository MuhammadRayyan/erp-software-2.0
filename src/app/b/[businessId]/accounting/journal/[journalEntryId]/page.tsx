import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { journalSourceHref, journalSourceLabel } from "@/modules/accounting/journal-source";
import { getJournalEntry } from "@/modules/accounting/services/journal-query-service";

export default async function JournalEntryPage({ params }: { params: Promise<{ businessId: string; journalEntryId: string }> }) {
  const { businessId, journalEntryId } = await params;
  const { user, access } = await requireModule(businessId, "accounting");
  const record = getJournalEntry(businessId, user.id, journalEntryId);
  if (!record) notFound();
  const sourceHref = journalSourceHref(businessId, record.entry.source_type, record.entry.source_id);
  const sourceReference = record.lines.find((line) => line.reference)?.reference;
  return <div className="page-container page-medium">
    <Link href={`/b/${businessId}/accounting/journal`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Journal</Link>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-3"><h1 className="page-title tabular">{record.entry.entry_number}</h1><Badge tone="info">Posted</Badge></div><p className="mt-2 text-sm text-muted-foreground">{formatDate(record.entry.date)} · {record.entry.description}</p></div>
      <div className="text-right text-sm"><p className="text-muted-foreground">Source</p>{sourceHref ? <Link href={sourceHref} className="font-medium text-primary hover:underline">{journalSourceLabel(record.entry.source_type)} {sourceReference}</Link> : <p className="font-medium">{journalSourceLabel(record.entry.source_type)} {sourceReference}</p>}</div>
    </div>
    <section className="data-panel overflow-x-auto">
      <table className="data-table min-w-[800px]">
        <thead><tr><th>Account</th><th>Description</th><th>Project</th><th className="text-right!">Debit</th><th className="text-right!">Credit</th></tr></thead>
        <tbody>{record.lines.map((line) => <tr key={line.id}>
          <td><span className="tabular text-muted-foreground">{line.code}</span> <span className="font-medium">{line.name}</span></td>
          <td className="text-muted-foreground">{line.description}</td>
          <td>{line.project_id ? <Link href={`/b/${businessId}/projects/${line.project_id}`} className="text-primary hover:underline">{line.project_code} · {line.project_name}</Link> : <span className="text-muted-foreground">—</span>}</td>
          <td className="money text-right">{line.debit_minor ? formatMoney(line.debit_minor, access.business.currency) : "—"}</td>
          <td className="money text-right">{line.credit_minor ? formatMoney(line.credit_minor, access.business.currency) : "—"}</td>
        </tr>)}</tbody>
        <tfoot><tr className="border-t border-border-strong bg-surface font-semibold"><td colSpan={3} className="h-11 px-3">Total</td><td className="money h-11 px-3 text-right">{formatMoney(record.debitMinor, access.business.currency)}</td><td className="money h-11 px-3 text-right">{formatMoney(record.creditMinor, access.business.currency)}</td></tr></tfoot>
      </table>
    </section>
    <div className="mt-4 flex justify-end"><Badge tone={record.debitMinor === record.creditMinor ? "success" : "danger"}>{record.debitMinor === record.creditMinor ? "Balanced" : "Out of balance"}</Badge></div>
  </div>;
}
