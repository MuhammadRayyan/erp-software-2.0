import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListPagination, type PaginationInfo } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listSuppliersPaginated } from "@/modules/suppliers/supplier-service";
import { SupplierTable } from "@/modules/suppliers/supplier-table";

export const metadata = { title: "Suppliers" };

function parsePageParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function parsePageSizeParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  // Only accept positive integers; the service caps it to 200. Out-of-range
  // values fall back to the default page size (50).
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

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
  const pageSize = parsePageSizeParam(sp.pageSize);
  // Server-side pagination: the list page is now URL-driven. `?page=N` loads
  // just the Nth slice (default 50 rows per page); the URL is shareable and
  // refresh-safe. `?pageSize=M` switches row density (25/50/100/200) and
  // resets the page to 1. Mirrors the sales-invoices list page pattern.
  const { rows: suppliers, ...pagination } = listSuppliersPaginated(businessId, user.id, { page, pageSize });
  const customFields = listCustomFieldDefinitions(businessId, user.id, "supplier")
    .filter((definition) => definition.showInList)
    .map(({ id, name, fieldType, selectOptions }) => ({ id, name, fieldType, selectOptions }));
  const customValues = suppliers.length && customFields.length
    ? Object.fromEntries(getCustomFieldValuesForEntities(businessId, user.id, "supplier", suppliers.map((supplier) => supplier.id)))
    : {};
  // Server-side preferences: column visibility syncs across devices for this user.
  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  const searchParamsUrl = new URLSearchParams();
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
          <h1 className="page-title">Suppliers</h1>
          <p className="page-description">Supplier records, payable balances, and purchase activity.</p>
        </div>
        <Button asChild>
          <Link href={`/b/${businessId}/suppliers/new`}>
            <Plus className="size-4" /> New Supplier
          </Link>
        </Button>
      </div>
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
            <Button asChild>
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
