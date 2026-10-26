import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { ListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import {
  buildDateSearchParams,
  DATE_PATTERN,
  parsePageParam,
  parsePageSizeParam,
} from "@/lib/params";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listPurchaseInvoicesPaginated } from "@/modules/purchase-invoices/purchase-invoice-service";
import { PurchaseInvoiceTable } from "@/modules/purchase-invoices/purchase-invoice-table";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Purchase Invoices" };
export const dynamic = "force-dynamic";

export default async function PurchaseInvoicesPage({
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
  
  const { rows: invoices, ...pagination } = listPurchaseInvoicesPaginated(businessId, user.id, {
    from,
    to,
    page,
    pageSize,
  });
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));
  const searchParamsUrl = buildDateSearchParams({ from, to, pageSize });
  const paginationInfo = pagination;

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader
        title="Purchase Invoices"
        description="Draft, post, pay, and inspect supplier bills."
      >
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/purchases/payments`}>Supplier Payments</Link>
        </Button>
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/purchases/invoices/new`}>
            <Plus className="size-4" /> New Purchase Invoice
          </Link>
        </Button>
      </PageHeader>
      {invoices.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/purchases/invoices`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Invoice from"
            toLabel="Invoice to"
          />
          {invoices.length ? (
            <PurchaseInvoiceTable
              businessId={businessId}
              invoices={invoices}
              serverSnapshot={columnSnapshots["purchase-invoices"]}
            />
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No purchase invoices match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination
            pathname={`/b/${businessId}/purchases/invoices`}
            searchParams={searchParamsUrl}
            info={paginationInfo}
          />
        </div>
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
