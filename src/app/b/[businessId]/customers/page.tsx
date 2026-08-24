import Link from "next/link";
import { ContactRound, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListPagination, type PaginationInfo } from "@/components/list-pagination";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getCustomFieldValuesForEntities, listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { listCustomersPaginated } from "@/modules/customers/customer-service";
import { CustomerTable } from "@/modules/customers/customer-table";

export const metadata = { title: "Customers" };

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

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const sp = await searchParams;
  const page = parsePageParam(sp.page);
  const pageSize = parsePageSizeParam(sp.pageSize);
  // Server-side pagination: the list page is now URL-driven. `?page=N` loads
  // just the Nth slice (default 50 rows per page); the URL is shareable and
  // refresh-safe. `?pageSize=M` switches row density (25/50/100/200) and
  // resets the page to 1. Mirrors the sales-invoices list page pattern.
  const { rows: customers, ...pagination } = listCustomersPaginated(businessId, user.id, {
    includeInactive: true,
    page,
    pageSize,
  });
  const customFields = listCustomFieldDefinitions(businessId, user.id, "customer")
    .filter((definition) => definition.showInList)
    .map(({ id, name, fieldType, selectOptions }) => ({ id, name, fieldType, selectOptions }));
  const customValues = customers.length && customFields.length
    ? Object.fromEntries(getCustomFieldValuesForEntities(businessId, user.id, "customer", customers.map((customer) => customer.id)))
    : {};
  // Server-side preferences: column visibility syncs across devices for this user.
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));
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
          <h1 className="page-title">Customers</h1>
          <p className="page-description">Contacts stored only in this business database.</p>
        </div>
        <Button asChild>
          <Link href={`/b/${businessId}/customers/new`}>
            <Plus className="size-4" /> New Customer
          </Link>
        </Button>
      </div>
      {customers.length || pagination.total > 0 ? (
        <div className="data-panel overflow-hidden">
          {customers.length ? (
            <CustomerTable
              businessId={businessId}
              customers={customers}
              customFields={customFields}
              customValues={customValues}
              serverSnapshot={columnSnapshots["customers"]}
            />
          ) : (
            <div className="p-10 text-center">
              <p className="font-medium">No customers match these filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different page or clear the search.</p>
            </div>
          )}
          <ListPagination pathname={`/b/${businessId}/customers`} searchParams={searchParamsUrl} info={paginationInfo} />
        </div>
      ) : (
        <EmptyState
          icon={<ContactRound className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No customers yet"
          description="Create your first customer to start billing."
          action={
            <Button asChild>
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
