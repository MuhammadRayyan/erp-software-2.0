import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import {
  buildPreservedSearchParams,
  loadPurchaseInvoiceListParams,
  sanitizePage,
  sanitizePageSize,
} from "@/lib/list-query-params";
import { DATE_PATTERN } from "@/lib/params";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listPurchaseInvoiceFilterOptions, listPurchaseInvoicesPaginated } from "@/modules/purchase-invoices/purchase-invoice-service";
import { PurchaseInvoiceTable } from "@/modules/purchase-invoices/purchase-invoice-table";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Purchase Invoices" };
export const dynamic = "force-dynamic";

export default async function PurchaseInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "purchases");
  const sp = await loadPurchaseInvoiceListParams(searchParams);
  const from = DATE_PATTERN.test(sp.from) ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to) ? sp.to : undefined;
  const page = sanitizePage(sp.page);
  const pageSize = sanitizePageSize(sp.pageSize);
  const q = sp.q || undefined;
  const status = sp.status || undefined;
  const supplierId = sp.supplierId || undefined;
  const projectId = sp.projectId || undefined;
  const sort = sp.sort || undefined;
  const dir = sp.dir;

  const { rows: invoices, summary, ...pagination } = listPurchaseInvoicesPaginated(businessId, user.id, {
    q,
    status,
    supplierId,
    projectId,
    from,
    to,
    sort,
    dir,
    page,
    pageSize,
  });
  const filterOptions = summary.unfilteredTotal > 0 ? listPurchaseInvoiceFilterOptions(businessId, user.id) : { suppliers: [], projects: [] };
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));
  const searchParamsUrl = buildPreservedSearchParams({
    q,
    status,
    supplierId,
    projectId,
    from,
    to,
    sort,
    dir: sort ? dir : undefined,
    pageSize,
  });

  const hasAnyRecords = summary.unfilteredTotal > 0;
  const hasActiveFilters = Boolean(q || status || supplierId || projectId || from || to);

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader
        title="Purchase Invoices"
        description="Draft, post, pay, and inspect supplier bills."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/purchases/invoices/new`}>
            <Plus className="size-4" /> New Purchase Invoice
          </Link>
        </Button>
      </PageHeader>
      {hasAnyRecords || hasActiveFilters ? (
        <PurchaseInvoiceTable
          businessId={businessId}
          invoices={invoices}
          summary={summary}
          supplierOptions={filterOptions.suppliers}
          projectOptions={filterOptions.projects}
          serverSnapshot={columnSnapshots["purchase-invoices"]}
          footer={
            <ListPagination
              pathname={`/b/${businessId}/purchases/invoices`}
              searchParams={searchParamsUrl}
              info={pagination}
            />
          }
        />
      ) : (
        <EmptyState
          icon={<FileInput className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No purchase invoices yet"
          description="Create a draft or post your first payable."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/purchases/invoices/new`}>
                <Plus className="size-4" /> New Purchase Invoice
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
