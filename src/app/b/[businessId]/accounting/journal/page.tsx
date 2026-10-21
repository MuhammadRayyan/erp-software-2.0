import Link from "next/link";
import { BookOpen, ChevronRight, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DensityToggle } from "@/components/density-toggle";
import { Button } from "@/components/ui/button";
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
      <PageHeader
        title="Journal"
        description="Balanced entries generated only by accounting services."
      >
        <DensityToggle businessId={businessId} />
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/accounting/find-and-recode`}>
            <SlidersHorizontal className="size-4" /> Find & Recode
          </Link>
        </Button>
      </PageHeader>
      
      {entries.length ? (
        <div className="data-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Description</th>
                  <th className="text-right!">Debit</th>
                  <th className="text-right!">Credit</th>
                  <th className="w-12 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="group">
                    <td>
                      <Link href={`/b/${businessId}/accounting/journal/${entry.id}`} className="tabular font-medium text-primary hover:underline">
                        {entry.entry_number}
                      </Link>
                    </td>
                    <td>{formatDate(entry.date)}</td>
                    <td>{journalSourceLabel(entry.source_type)}</td>
                    <td className="max-w-[360px] truncate text-muted-foreground">{entry.description}</td>
                    <td className="money text-right">{formatMoney(entry.debit_minor, access.business.currency)}</td>
                    <td className="money text-right">{formatMoney(entry.credit_minor, access.business.currency)}</td>
                    <td className="text-right">
                      <Button asChild variant="ghost" size="icon" className="size-7 text-muted-foreground opacity-50 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <Link href={`/b/${businessId}/accounting/journal/${entry.id}`} aria-label={`Open ${entry.entry_number}`}>
                          <ChevronRight className="size-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<BookOpen className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No journal entries yet"
          description="Post a Sales Invoice or Receipt to create the first balanced entry."
        />
      )}
    </div>
  );
}