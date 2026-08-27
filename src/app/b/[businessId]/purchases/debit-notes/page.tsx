import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listDebitNotes } from "@/modules/debit-notes/debit-note-service";
import { DebitNoteTable } from "@/modules/debit-notes/debit-note-table";

export const metadata = { title: "Debit Notes" };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  const searchParamsUrl = new URLSearchParams();
  if (from) searchParamsUrl.set("from", from);
  if (to) searchParamsUrl.set("to", to);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Debit Notes</h1>
          <p className="page-description">Draft, post, and track supplier debit notes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/b/${businessId}/purchases/debit-notes/new`}>
              <Plus className="size-4" /> New Debit Note
            </Link>
          </Button>
        </div>
      </div>
      {debitNotes.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/purchases/debit-notes`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="From"
            toLabel="To"
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
