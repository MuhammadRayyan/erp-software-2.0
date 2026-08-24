import Link from "next/link";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { listJournalEntries } from "@/modules/accounting/services/journal-query-service";

export const metadata = { title: "Journal" };

export default async function JournalPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "accounting");
  const entries = listJournalEntries(businessId, user.id);
  return (
    <div className="page-container">
      <div className="page-header"><div><h1 className="page-title">Journal</h1><p className="page-description">Balanced entries generated only by accounting services.</p></div></div>
      {entries.length ? (
        <div className="data-panel overflow-x-auto">
          <table className="data-table min-w-[760px]">
            <thead><tr><th>Entry</th><th>Date</th><th>Source</th><th>Description</th><th className="text-right!">Debit</th><th className="text-right!">Credit</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={entry.id}><td><Link href={`/b/${businessId}/accounting/journal/${entry.id}`} className="tabular font-medium text-primary hover:underline">{entry.entry_number}</Link></td><td>{formatDate(entry.date)}</td><td>{journalSourceLabel(entry.source_type)}</td><td className="max-w-[360px] truncate text-muted-foreground">{entry.description}</td><td className="money text-right">{formatMoney(entry.debit_minor, access.business.currency)}</td><td className="money text-right">{formatMoney(entry.credit_minor, access.business.currency)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<BookOpen className="mx-auto mb-3 size-7 text-muted-foreground" />} title="No journal entries yet" description="Post a Sales Invoice or Receipt to create the first balanced entry." />
      )}
    </div>
  );
}
