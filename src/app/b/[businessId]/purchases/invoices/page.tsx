import Link from "next/link";
import { FileInput, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listPurchaseInvoices } from "@/modules/purchase-invoices/purchase-invoice-service";
import { PurchaseInvoiceTable } from "@/modules/purchase-invoices/purchase-invoice-table";

export const metadata = { title: "Purchase Invoices" };
export default async function PurchaseInvoicesPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; const { user } = await requireModule(businessId, "purchases"); const invoices = listPurchaseInvoices(businessId, user.id); return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Purchase Invoices</h1><p className="page-description">Draft, post, pay, and inspect supplier bills.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><Link href={`/b/${businessId}/purchases/payments`}>Supplier Payments</Link></Button><Button asChild><Link href={`/b/${businessId}/purchases/invoices/new`}><Plus className="size-4" /> New Purchase Invoice</Link></Button></div></div>{invoices.length ? <PurchaseInvoiceTable businessId={businessId} invoices={invoices} /> : <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><FileInput className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No purchase invoices yet</h2><p className="mt-1 text-sm text-muted-foreground">Create a draft or post your first payable.</p><Button asChild className="mt-4"><Link href={`/b/${businessId}/purchases/invoices/new`}><Plus className="size-4" /> New Purchase Invoice</Link></Button></div>}</div>; }
