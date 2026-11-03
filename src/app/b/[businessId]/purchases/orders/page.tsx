import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { DATE_PATTERN } from "@/lib/params";
import { listPurchaseOrders } from "@/modules/purchase-orders/purchase-order-service";
import { PurchaseOrderTable } from "@/modules/purchase-orders/purchase-order-table";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Purchase Orders" };
export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "purchases");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;
  
  const orders = listPurchaseOrders(businessId, user.id, { from, to });

  return (
    <div className="page-container">
      <LiveRefresh />
      <PageHeader
        title="Purchase Orders"
        description="Operational orders with no ledger, AP, or Input VAT effect."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/purchases/orders/new`}>
            <Plus className="size-4" /> New Purchase Order
          </Link>
        </Button>
      </PageHeader>
      
      {orders.length ? (
        <div className="data-panel overflow-hidden">
          <PurchaseOrderTable businessId={businessId} orders={orders} />
        </div>
      ) : (
        <EmptyState
          icon={<ShoppingCart className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No purchase orders yet"
          description="Create an order without affecting the ledger."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/purchases/orders/new`}>
                <Plus className="size-4" /> New Purchase Order
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
