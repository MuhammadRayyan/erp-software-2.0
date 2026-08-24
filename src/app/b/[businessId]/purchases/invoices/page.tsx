import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { ListPagination, type PaginationInfo } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listPurchaseInvoicesPaginated } from "@/modules/purchase-invoices/purchase-invoice-service";
import { PurchaseInvoiceTable } from "@/modules/purchase-invoices/purchase-invoice-table";

export const metadata = { title: "Purchase Invoices" };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parsePageParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function parsePageSizeParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

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
  // Server-side pagination: `?page=N` loads the Nth slice (default 50 rows),
  // `?pageSize=M` switches row density (25/50/100/200) and resets to page 1.
  // `from`/`to` filter by invoice_date. The URL is shareable + refresh-safe.
  const { rows: invoices, ...pagination } = listPurchaseInvoicesPaginated(businessId, user.id, { from, to, page, pageSize });
  // Server-side preferences: column visibility syncs across devices for this user.
  // Same pattern as the customers/invoices/suppliers lists — the snapshot is
  // decoded from the flat `Record<string,string>` returned by the preferences API.
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Invoices</h1>
          <p className="page-description">Draft, post, pay, and inspect supplier bills.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href={`/b/${businessId}/purchases/payments`}>Supplier Payments</Link></Button>
          <Button asChild><Link href={`/b/${businessId}/purchases/invoices/new`}><Plus className="size-4" /> New Purchase Invoice</Link></Button>
        </div>
      </div>
      {invoices.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter pathname={`/b/${businessId}/purchases/invoices`} searchParams={searchParamsUrl} initialFrom={from ?? ""} initialTo={to ?? ""} fromLabel="Invoice from" toLabel="Invoice to" />
          {invoices.length ? (
            <PurchaseInvoiceTable businessId={businessId} invoices={invoices} serverSnapshot={columnSnapshots["purchase-invoices"]} />
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No purchase invoices match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination pathname={`/b/${businessId}/purchases/invoices`} searchParams={searchParamsUrl} info={paginationInfo} />
        </div>
      ) : (
        <EmptyState icon={<FileInput className="mx-auto mb-3 size-7 text-muted-foreground" />} title="No purchase invoices yet" description="Create a draft or post your first payable." action={<Button asChild><Link href={`/b/${businessId}/purchases/invoices/new`}><Plus className="size-4" /> New Purchase Invoice</Link></Button>} />
      )}
    </div>
  );
}
