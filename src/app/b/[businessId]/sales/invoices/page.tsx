import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { ListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { buildDateSearchParams, DATE_PATTERN, parsePageParam, parsePageSizeParam } from "@/lib/params";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { InvoiceTable } from "@/modules/sales-invoices/invoice-table";
import { listInvoicesPaginated } from "@/modules/sales-invoices/invoice-service";

export const metadata = { title: "Sales Invoices" };

export default async function InvoiceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const page = parsePageParam(sp.page);
  const pageSize = parsePageSizeParam(sp.pageSize);
  
  const { rows: invoices, ...pagination } = listInvoicesPaginated(businessId, user.id, { from, to, page, pageSize });
  const customFieldColumns = invoices.length
    ? listCustomFieldDefinitions(businessId, user.id, "sales_invoice")
        .filter((definition) => definition.showInList)
        .map(({ id, name, fieldType, selectOptions }) => ({ id, name, fieldType, selectOptions }))
    : [];
  const customValues = invoices.length && customFieldColumns.length
    ? Object.fromEntries(getCustomFieldValuesForEntities(businessId, user.id, "sales_invoice", invoices.map((invoice) => invoice.id)))
    : {};
  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  const searchParamsUrl = buildDateSearchParams({ from, to });
  if (pageSize !== undefined) searchParamsUrl.set("pageSize", String(pageSize));

  return (
    <div className="page-container">
      <PageHeader title="Sales Invoices" description="Draft, post, collect, and inspect customer invoices.">
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/sales/receipts`}>Receipts</Link>
        </Button>
        <Button asChild>
          <Link href={`/b/${businessId}/sales/invoices/new`}>
            <Plus className="size-4" /> New Invoice
          </Link>
        </Button>
      </PageHeader>
      {invoices.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/sales/invoices`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Invoice from"
            toLabel="Invoice to"
          />
          {invoices.length ? (
            <InvoiceTable
              businessId={businessId}
              invoices={invoices}
              customFields={customFieldColumns}
              customValues={customValues}
              serverSnapshot={columnSnapshots["sales-invoices"]}
            />
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No invoices match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the date filters.</p>
            </div>
          )}
          <ListPagination
            pathname={`/b/${businessId}/sales/invoices`}
            searchParams={searchParamsUrl}
            info={pagination}
          />
        </div>
      ) : (
        <EmptyState
          icon={<ReceiptText className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No sales invoices yet"
          description="Create a draft or post your first receivable."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/sales/invoices/new`}>
                <Plus className="size-4" /> New Invoice
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
