import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import {
  buildPreservedSearchParams,
  loadInvoiceListParams,
  sanitizePage,
  sanitizePageSize,
} from "@/lib/list-query-params";
import { DATE_PATTERN } from "@/lib/params";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { InvoiceTable } from "@/modules/sales-invoices/invoice-table";
import { listInvoiceFilterOptions, listInvoicesPaginated } from "@/modules/sales-invoices/invoice-service";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Sales Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoiceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const sp = await loadInvoiceListParams(searchParams);
  const from = DATE_PATTERN.test(sp.from) ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to) ? sp.to : undefined;
  const page = sanitizePage(sp.page);
  const pageSize = sanitizePageSize(sp.pageSize);
  const q = sp.q || undefined;
  const status = sp.status || undefined;
  const customerId = sp.customerId || undefined;
  const projectId = sp.projectId || undefined;
  const sort = sp.sort || undefined;
  const dir = sp.dir;

  const { rows: invoices, summary, ...pagination } = listInvoicesPaginated(businessId, user.id, {
    q,
    status,
    customerId,
    projectId,
    from,
    to,
    sort,
    dir,
    page,
    pageSize,
  });
  const filterOptions = summary.unfilteredTotal > 0 ? listInvoiceFilterOptions(businessId, user.id) : { customers: [], projects: [] };
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
  const searchParamsUrl = buildPreservedSearchParams({
    q,
    status,
    customerId,
    projectId,
    from,
    to,
    sort,
    dir: sort ? dir : undefined,
    pageSize,
  });

  const hasAnyRecords = summary.unfilteredTotal > 0;
  const hasActiveFilters = Boolean(q || status || customerId || projectId || from || to);

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader title="Sales Invoices" description="Draft, post, collect, and inspect customer invoices.">
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/sales/invoices/new`}>
            <Plus className="size-4" /> New Invoice
          </Link>
        </Button>
      </PageHeader>
      {hasAnyRecords || hasActiveFilters ? (
        <InvoiceTable
          businessId={businessId}
          invoices={invoices}
          summary={summary}
          customerOptions={filterOptions.customers}
          projectOptions={filterOptions.projects}
          customFields={customFieldColumns}
          customValues={customValues}
          serverSnapshot={columnSnapshots["sales-invoices"]}
          footer={
            <ListPagination
              pathname={`/b/${businessId}/sales/invoices`}
              searchParams={searchParamsUrl}
              info={pagination}
            />
          }
        />
      ) : (
        <EmptyState
          icon={<ReceiptText className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No sales invoices yet"
          description="Create a draft or post your first receivable."
          action={
            <Button permission="create" asChild>
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
