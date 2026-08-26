// @ts-nocheck
import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { ListPagination, type PaginationInfo } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { DebitNoteTable } from "@/modules/purchase-debit-notes/debitNote-table";
import { listDebitNotesPaginated } from "@/modules/purchase-debit-notes/debitNote-service";

export const metadata = { title: "Debit Notes" };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parsePageParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function parsePageSizeParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  // Only accept positive integers; the service caps it to 200. Out-of-range
  // values fall back to the default page size (50).
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

export default async function DebitNoteListPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "purchases");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const page = parsePageParam(sp.page);
  const pageSize = parsePageSizeParam(sp.pageSize);
  // Server-side pagination: the list page is now URL-driven. `?page=N` loads
  // just the Nth slice (default 50 rows per page); the URL is shareable and
  // refresh-safe. `?pageSize=M` switches row density (25/50/100/200) and
  // resets the page to 1. The server reads `from`/`to` for date filtering
  // too — the pagination footer uses the same `total` to compute "Page X
  // of Y".
  const { rows: debitNotes, ...pagination } = listDebitNotesPaginated(businessId, user.id, { from, to, page, pageSize });
  const customFieldColumns = debitNotes.length
    ? listCustomFieldDefinitions(businessId, user.id, "purchases_debitNote")
        .filter((definition) => definition.showInList)
        .map(({ id, name, fieldType, selectOptions }) => ({ id, name, fieldType, selectOptions }))
    : [];
  const customValues = debitNotes.length && customFieldColumns.length
    ? Object.fromEntries(getCustomFieldValuesForEntities(businessId, user.id, "purchases_debitNote", debitNotes.map((debitNote) => debitNote.id)))
    : {};
  // Server-side preferences: column visibility syncs across devices for this user.
  // Stored as flat `Record<string,string>` of JSON-encoded maps; decode into one
  // ColumnVisibility map per storage key. Skip the API round-trip on the server
  // (direct DB read) — clients that toggle after hydration PUT new state.
  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  const searchParamsUrl = new URLSearchParams();
  if (from) searchParamsUrl.set("from", from);
  if (to) searchParamsUrl.set("to", to);
  if (pageSize !== undefined) searchParamsUrl.set("pageSize", String(pageSize));
  const paginationInfo: PaginationInfo = {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
    totalPages: pagination.totalPages,
  };
  return (
    <div className="page-container">
      <div className="page-header"><div><h1 className="page-title">Debit Notes</h1><p className="page-description">Draft, post, collect, and inspect customer debitNotes.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><Link href={`/b/${businessId}/purchases/receipts`}>Receipts</Link></Button><Button asChild><Link href={`/b/${businessId}/purchases/debit-notes/new`}><Plus className="size-4" /> New DebitNote</Link></Button></div></div>
      {debitNotes.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter pathname={`/b/${businessId}/purchases/debit-notes`} searchParams={searchParamsUrl} initialFrom={from ?? ""} initialTo={to ?? ""} fromLabel="DebitNote from" toLabel="DebitNote to" />
          {debitNotes.length ? (
            <DebitNoteTable businessId={businessId} debitNotes={debitNotes} customFields={customFieldColumns} customValues={customValues} serverSnapshot={columnSnapshots["purchase-debit-notes"]} />
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No debitNotes match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination pathname={`/b/${businessId}/purchases/debit-notes`} searchParams={searchParamsUrl} info={paginationInfo} />
        </div>
      ) : (
        <EmptyState icon={<ReceiptText className="mx-auto mb-3 size-7 text-muted-foreground" />} title="No purchases debitNotes yet" description="Create a draft or post your first receivable." action={<Button asChild><Link href={`/b/${businessId}/purchases/debit-notes/new`}><Plus className="size-4" /> New DebitNote</Link></Button>} />
      )}
    </div>
  );
}
