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
import { parsePageParam, parsePageSizeParam } from "@/lib/params";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const sp = await searchParams;
  const page = parsePageParam(sp.page);
  const pageSize = parsePageSizeParam(sp.pageSize, 50);

  const { rows: suppliers, ...pagination } = listSuppliersPaginated(businessId, user.id, { page, pageSize });
  
  const customFields = listCustomFieldDefinitions(businessId, user.id, "supplier")
    .filter((definition) => definition.showInList)
    .map(({ id, name, fieldType, selectOptions }) => ({ id, name, fieldType, selectOptions }));
  
  const customValues = suppliers.length && customFields.length
    ? Object.fromEntries(getCustomFieldValuesForEntities(businessId, user.id, "supplier", suppliers.map((supplier) => supplier.id)))
    : {};

  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  
  const searchParamsUrl = new URLSearchParams();
  if (sp.pageSize) searchParamsUrl.set("pageSize", sp.pageSize);

  const paginationInfo = pagination;

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
      
      {suppliers.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          {suppliers.length ? (
            <SupplierTable
              businessId={businessId}
              currency={access.business.currency}
              suppliers={suppliers}
              customFields={customFields}
              customValues={customValues}
              serverSnapshot={columnSnapshots["suppliers"]}
            />
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No suppliers match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the search.</p>
            </div>
          )}
          <ListPagination pathname={`/b/${businessId}/suppliers`} searchParams={searchParamsUrl} info={paginationInfo} />
        </div>
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