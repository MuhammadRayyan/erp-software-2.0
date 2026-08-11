import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listSuppliers } from "@/modules/suppliers/supplier-service";
import { SupplierTable } from "@/modules/suppliers/supplier-table";

export const metadata = { title: "Suppliers" };
export default async function SuppliersPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; const { user, access } = await requireModule(businessId, "purchases"); const suppliers = listSuppliers(businessId, user.id); return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Suppliers</h1><p className="page-description">Supplier records, payable balances, and purchase activity.</p></div><Button asChild><Link href={`/b/${businessId}/suppliers/new`}><Plus className="size-4" /> New Supplier</Link></Button></div>{suppliers.length ? <SupplierTable businessId={businessId} currency={access.business.currency} suppliers={suppliers} /> : <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><Truck className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No suppliers yet</h2><p className="mt-1 text-sm text-muted-foreground">Add a supplier to begin the purchase workflow.</p><Button asChild className="mt-4"><Link href={`/b/${businessId}/suppliers/new`}><Plus className="size-4" /> New Supplier</Link></Button></div>}</div>; }
