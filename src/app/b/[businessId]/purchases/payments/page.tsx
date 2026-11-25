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
import { listSupplierPaymentsPaginated } from "@/modules/supplier-payments/supplier-payment-service";
import { SupplierPaymentTable } from "@/modules/supplier-payments/supplier-payment-table";

export const metadata = { title: "Supplier Payments" };
export const dynamic = "force-dynamic";

export default async function SupplierPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const sp = await loadCashDocumentListParams(searchParams);
  const from = DATE_PATTERN.test(sp.from) ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to) ? sp.to : undefined;
  const page = sanitizePage(sp.page);
  const pageSize = sanitizePageSize(sp.pageSize);
  const q = sp.q || undefined;
  const status = sp.status || undefined;
  const sort = sp.sort || undefined;
  const dir = sp.dir;

  const { rows: payments, summary, ...pagination } = listSupplierPaymentsPaginated(
    businessId,
    user.id,
    {
      q,
      status,
      from,
      to,
      sort,
      dir,
      page,
      pageSize,
    },
  );
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
      <PageHeader
        title="Supplier Payments"
        description="Posted supplier disbursements and their reversals."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/purchases/payments/new`}>
            <Plus className="size-4" /> Record Payment
          </Link>
        </Button>
      </PageHeader>
      {hasAnyRecords || hasActiveFilters ? (
        <SupplierPaymentTable
          businessId={businessId}
          baseCurrency={access.business.currency}
          payments={payments}
          summary={summary}
          serverSnapshot={columnSnapshots["purchase-payments"]}
          footer={
            <ListPagination
              pathname={`/b/${businessId}/purchases/payments`}
              searchParams={searchParamsUrl}
              info={pagination}
            />
          }
        />
      ) : (
        <EmptyState
          title="No supplier payments yet"
          description="Record a payment from a posted Purchase Invoice."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/purchases/payments/new`}>
                <Plus className="size-4" /> Record Payment
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
