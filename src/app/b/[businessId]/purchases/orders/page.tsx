import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listPurchaseOrders } from "@/modules/purchase-orders/purchase-order-service";
import { PurchaseOrderTable } from "@/modules/purchase-orders/purchase-order-table";

export const metadata = { title: "Purchase Orders" };
export default async function PurchaseOrdersPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; const { user } = await requireModule(businessId, "purchases"); const orders = listPurchaseOrders(businessId, user.id); return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Purchase Orders</h1><p className="page-description">Operational orders with no ledger, AP, or Input VAT effect.</p></div><Button asChild><Link href={`/b/${businessId}/purchases/orders/new`}><Plus className="size-4" /> New Purchase Order</Link></Button></div>{orders.length ? <PurchaseOrderTable businessId={businessId} orders={orders} /> : <EmptyState icon={<ShoppingCart className="mx-auto mb-3 size-7 text-muted-foreground" />} title="No purchase orders yet" description="Create an order without affecting the ledger." action={<Button asChild><Link href={`/b/${businessId}/purchases/orders/new`}><Plus className="size-4" /> New Purchase Order</Link></Button>} />}</div>; }
