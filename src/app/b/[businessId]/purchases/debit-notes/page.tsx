import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { buildDateSearchParams, DATE_PATTERN } from "@/lib/params";
import { listDebitNotes } from "@/modules/debit-notes/debit-note-service";
import { DebitNoteTable } from "@/modules/debit-notes/debit-note-table";

export const metadata = { title: "Debit Notes" };

export default async function DebitNoteListPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "purchases");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const debitNotes = listDebitNotes(businessId, user.id, { from, to });
  const searchParamsUrl = buildDateSearchParams({ from, to });

  return (
    <div className="page-container">
      <PageHeader
        title="Debit Notes"
        description="Draft, post, and track supplier debit notes."
      >
        <Button asChild>
          <Link href={`/b/${businessId}/purchases/debit-notes/new`}>
            <Plus className="size-4" /> New Debit Note
          </Link>
        </Button>
      </PageHeader>
      {debitNotes.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/purchases/debit-notes`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Debit note from"
            toLabel="Debit note to"
          />
          <DebitNoteTable businessId={businessId} debitNotes={debitNotes} />
        </div>
      ) : (
        <EmptyState
          icon={<ReceiptText className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No debit notes yet"
          description="Create a draft or post your first supplier debit note."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/purchases/debit-notes/new`}>
                <Plus className="size-4" /> New Debit Note
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
