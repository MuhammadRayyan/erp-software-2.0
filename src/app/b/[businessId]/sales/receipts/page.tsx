import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListPagination } from "@/components/list-pagination";
import { LiveRefresh } from "@/components/live-refresh";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import {
  buildPreservedSearchParams,
  loadCashDocumentListParams,
  sanitizePage,
  sanitizePageSize,
} from "@/lib/list-query-params";
import { DATE_PATTERN } from "@/lib/params";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listReceiptsPaginated } from "@/modules/receipts/receipt-service";
import { ReceiptTable } from "@/modules/receipts/receipt-table";

export const metadata = { title: "Receipts" };
export const dynamic = "force-dynamic";

export default async function ReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const sp = await loadCashDocumentListParams(searchParams);
  const from = DATE_PATTERN.test(sp.from) ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to) ? sp.to : undefined;
  const page = sanitizePage(sp.page);
  const pageSize = sanitizePageSize(sp.pageSize);
  const q = sp.q || undefined;
  const status = sp.status || undefined;
  const sort = sp.sort || undefined;
  const dir = sp.dir;

  const { rows: receipts, summary, ...pagination } = listReceiptsPaginated(businessId, user.id, {
    q,
    status,
    from,
    to,
    sort,
    dir,
    page,
    pageSize,
  });
  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  const searchParamsUrl = buildPreservedSearchParams({
    q,
    status,
    from,
    to,
    sort,
    dir: sort ? dir : undefined,
    pageSize,
  });

  const hasAnyRecords = summary.unfilteredTotal > 0;
  const hasActiveFilters = Boolean(q || status || from || to);

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader title="Receipts" description="Posted customer collections and their reversals.">
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/sales/receipts/new`}>
            <Plus className="size-4" /> Record Receipt
          </Link>
        </Button>
      </PageHeader>
      {hasAnyRecords || hasActiveFilters ? (
        <ReceiptTable
          businessId={businessId}
          baseCurrency={access.business.currency}
          receipts={receipts}
          summary={summary}
          serverSnapshot={columnSnapshots["sales-receipts"]}
          footer={
            <ListPagination
              pathname={`/b/${businessId}/sales/receipts`}
              searchParams={searchParamsUrl}
              info={pagination}
            />
          }
        />
      ) : (
        <EmptyState
          title="No receipts yet"
          description="Record a customer collection from a posted invoice."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/sales/receipts/new`}>
                <Plus className="size-4" /> Record Receipt
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
