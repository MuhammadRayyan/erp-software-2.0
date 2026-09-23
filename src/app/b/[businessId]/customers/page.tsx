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
import { parsePageParam, parsePageSizeParam } from "@/lib/params";

export const metadata = { title: "Customers" };

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
  const pageSize = parsePageSizeParam(sp.pageSize, 50);

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

  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));
  
  const searchParamsUrl = new URLSearchParams();
  if (sp.pageSize) searchParamsUrl.set("pageSize", sp.pageSize);

  const paginationInfo = pagination;

  return (
    <div className="page-container">
      <PageHeader
        title="Customers"
        description="Contacts stored only in this business database."
      >
        <Button asChild>
          <Link href={`/b/${businessId}/customers/new`}>
            <Plus className="size-4" /> New Customer
          </Link>
        </Button>
      </PageHeader>
      
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