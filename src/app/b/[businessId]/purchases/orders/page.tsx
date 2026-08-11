import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listPurchaseOrders } from "@/modules/purchase-orders/purchase-order-service";
import { PurchaseOrderTable } from "@/modules/purchase-orders/purchase-order-table";

export const metadata = { title: "Purchase Orders" };
export default async function PurchaseOrdersPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; const { user } = await requireModule(businessId, "purchases"); const orders = listPurchaseOrders(businessId, user.id); return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Purchase Orders</h1><p className="page-description">Operational orders with no ledger, AP, or Input VAT effect.</p></div><Button asChild><Link href={`/b/${businessId}/purchases/orders/new`}><Plus className="size-4" /> New Purchase Order</Link></Button></div>{orders.length ? <PurchaseOrderTable businessId={businessId} orders={orders} /> : <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><ShoppingCart className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No purchase orders yet</h2><p className="mt-1 text-sm text-muted-foreground">Create an order without affecting the ledger.</p><Button asChild className="mt-4"><Link href={`/b/${businessId}/purchases/orders/new`}><Plus className="size-4" /> New Purchase Order</Link></Button></div>}</div>; }
