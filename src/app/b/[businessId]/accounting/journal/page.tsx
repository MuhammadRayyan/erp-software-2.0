import Link from "next/link";
import { BookOpen, Coins, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listJournalEntries } from "@/modules/accounting/services/journal-query-service";
import { JournalTable, type JournalEntryRow } from "@/modules/accounting/components/journal-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = { title: "Journal" };

export default async function JournalPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "accounting");
  const entries = listJournalEntries(businessId, user.id) as unknown as JournalEntryRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <PageHeader
        title="Journal"
        description="Balanced ledger entries across modules."
      >
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/accounting/find-and-recode`}>
            <SlidersHorizontal className="size-4" /> Find &amp; Recode
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/accounting/fx-revaluation`}>
            <Coins className="size-4" /> FX Revaluation
          </Link>
        </Button>
      </PageHeader>

      {entries.length ? (
        <JournalTable
          businessId={businessId}
          currency={access.business.currency}
          entries={entries}
          serverSnapshot={columnSnapshots["journal-entries"]}
        />
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
