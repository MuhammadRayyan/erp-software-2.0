import Link from "next/link";
import { ContactRound, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listCustomersPaginated } from "@/modules/customers/customer-service";
import { CustomerTable } from "@/modules/customers/customer-table";
import {
  buildPreservedSearchParams,
  loadDirectoryListParams,
  sanitizePage,
  sanitizePageSize,
} from "@/lib/list-query-params";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const sp = await loadDirectoryListParams(searchParams);
  const page = sanitizePage(sp.page);
  const pageSize = sanitizePageSize(sp.pageSize, 50);
  const q = sp.q || undefined;
  const status = sp.status || undefined;
  const sort = sp.sort || undefined;
  const dir = sp.dir;

  const { rows: customers, summary, ...pagination } = listCustomersPaginated(businessId, user.id, {
    includeInactive: true,
    q,
    status,
    sort,
    dir,
    page,
    pageSize,
  });

  const customFields = listCustomFieldDefinitions(businessId, user.id, "customer")
    .filter((definition) => definition.showInList)
    .map(({ id, name, fieldType, selectOptions }) => ({ id, name, fieldType, selectOptions }));

  const customValues = customers.length && customFields.length
    ? Object.fromEntries(getCustomFieldValuesForEntities(businessId, user.id, "customer", customers.map((customer) => customer.id)))
    : {};

  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));
  const searchParamsUrl = buildPreservedSearchParams({
    q,
    status,
    sort,
    dir: sort ? dir : undefined,
    pageSize,
  });
  const hasAnyRecords = summary.unfilteredTotal > 0;
  const hasActiveFilters = Boolean(q || status);

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader
        title="Customers"
        description="Contacts stored only in this business database."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/customers/new`}>
            <Plus className="size-4" /> New Customer
          </Link>
        </Button>
      </PageHeader>

      {hasAnyRecords || hasActiveFilters ? (
        <CustomerTable
          businessId={businessId}
          customers={customers}
          summary={summary}
          customFields={customFields}
          customValues={customValues}
          serverSnapshot={columnSnapshots["customers"]}
          footer={<ListPagination pathname={`/b/${businessId}/customers`} searchParams={searchParamsUrl} info={pagination} />}
        />
      ) : (
        <EmptyState
          icon={<ContactRound className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No customers yet"
          description="Create your first customer to start billing."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/customers/new`}>
                <Plus className="size-4" /> New Customer
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}