import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ListPagination } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listSuppliersPaginated } from "@/modules/suppliers/supplier-service";
import { SupplierTable } from "@/modules/suppliers/supplier-table";
import {
  buildPreservedSearchParams,
  loadDirectoryListParams,
  sanitizePage,
  sanitizePageSize,
} from "@/lib/list-query-params";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const sp = await loadDirectoryListParams(searchParams);
  const page = sanitizePage(sp.page);
  const pageSize = sanitizePageSize(sp.pageSize, 50);
  const q = sp.q || undefined;
  const status = sp.status || undefined;
  const sort = sp.sort || undefined;
  const dir = sp.dir;

  const { rows: suppliers, summary, ...pagination } = listSuppliersPaginated(businessId, user.id, {
    q,
    status,
    sort,
    dir,
    page,
    pageSize,
  });

  const customFields = listCustomFieldDefinitions(businessId, user.id, "supplier")
    .filter((definition) => definition.showInList)
    .map(({ id, name, fieldType, selectOptions }) => ({ id, name, fieldType, selectOptions }));

  const customValues = suppliers.length && customFields.length
    ? Object.fromEntries(getCustomFieldValuesForEntities(businessId, user.id, "supplier", suppliers.map((supplier) => supplier.id)))
    : {};

  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
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
        title="Suppliers"
        description="Supplier records, payable balances, and purchase activity."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/suppliers/new`}>
            <Plus className="size-4" /> New Supplier
          </Link>
        </Button>
      </PageHeader>

      {hasAnyRecords || hasActiveFilters ? (
        <SupplierTable
          businessId={businessId}
          currency={access.business.currency}
          suppliers={suppliers}
          summary={summary}
          customFields={customFields}
          customValues={customValues}
          serverSnapshot={columnSnapshots["suppliers"]}
          footer={<ListPagination pathname={`/b/${businessId}/suppliers`} searchParams={searchParamsUrl} info={pagination} />}
        />
      ) : (
        <EmptyState
          icon={<Truck className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No suppliers yet"
          description="Add a supplier to begin the purchase workflow."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/suppliers/new`}>
                <Plus className="size-4" /> New Supplier
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}