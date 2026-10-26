import Link from "next/link";
import { FileMinus2, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { buildDateSearchParams, DATE_PATTERN } from "@/lib/params";
import { CreditNoteTable } from "@/modules/sales-credit-notes/credit-note-table";
import { listCreditNotes } from "@/modules/sales-credit-notes/credit-note-service";

export const metadata = { title: "Sales Credit Notes" };

export default async function CreditNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  
  const notes = listCreditNotes(businessId, user.id, { from, to });
  const searchParamsUrl = buildDateSearchParams({ from, to });

  return (
    <div className="page-container">
      <PageHeader title="Sales Credit Notes" description="Customer credits applied to posted Sales Invoices.">
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/sales/credit-notes/new`}>
            <Plus className="size-4" /> New Credit Note
          </Link>
        </Button>
      </PageHeader>
      {notes.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/sales/credit-notes`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Credit Note from"
            toLabel="Credit Note to"
          />
          <CreditNoteTable businessId={businessId} creditNotes={notes} />
        </div>
      ) : (
        <EmptyState
          icon={<FileMinus2 className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No sales credit notes yet"
          description="Create one from a posted invoice when a customer needs a credit."
        />
      )}
    </div>
  );
}
