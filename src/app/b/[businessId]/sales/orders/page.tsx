import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { buildDateSearchParams, DATE_PATTERN } from "@/lib/params";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";
import { SalesOrderTable } from "@/modules/sales-orders/sales-order-table";
import { listSalesOrders } from "@/modules/sales-orders/sales-order-service";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Sales Orders" };
export const dynamic = "force-dynamic";

export default async function OrderListPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  const orders = listSalesOrders(businessId, user.id, { from, to });
  const preferences = listPreferences(businessId, user.id);
  const columnSnapshots = decodeColumnSnapshots(preferences);
  const searchParamsUrl = buildDateSearchParams({ from, to });

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader title="Sales Orders" description="Draft, issue, and track customer orders.">
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/sales/orders/new`}>
            <Plus className="size-4" /> New Order
          </Link>
        </Button>
      </PageHeader>
      {orders.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/sales/orders`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Order from"
            toLabel="Order to"
          />
          <SalesOrderTable
            businessId={businessId}
            orders={orders}
            serverSnapshot={columnSnapshots["sales-orders"]}
          />
        </div>
      ) : (
        <EmptyState
          icon={<ReceiptText className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No sales orders yet"
          description="Create your first sales order for a customer."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/sales/orders/new`}>
                <Plus className="size-4" /> New Order
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
