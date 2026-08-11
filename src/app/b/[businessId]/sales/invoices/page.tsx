import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { InvoiceTable } from "@/modules/sales-invoices/invoice-table";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";

export const metadata = { title: "Sales Invoices" };

export default async function InvoiceListPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "sales");
  const invoices = listInvoices(businessId, user.id);
  return (
    <div className="page-container">
      <div className="page-header"><div><h1 className="page-title">Sales Invoices</h1><p className="page-description">Draft, post, collect, and inspect customer invoices.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><Link href={`/b/${businessId}/sales/receipts`}>Receipts</Link></Button><Button asChild><Link href={`/b/${businessId}/sales/invoices/new`}><Plus className="size-4" /> New Invoice</Link></Button></div></div>
      {invoices.length ? <InvoiceTable businessId={businessId} invoices={invoices} /> : <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><ReceiptText className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No sales invoices yet</h2><p className="mt-1 text-sm text-muted-foreground">Create a draft or post your first receivable.</p><Button asChild className="mt-4"><Link href={`/b/${businessId}/sales/invoices/new`}><Plus className="size-4" /> New Invoice</Link></Button></div>}
    </div>
  );
}
