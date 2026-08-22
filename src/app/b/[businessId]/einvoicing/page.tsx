import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { EInvoiceList, type EInvoiceListRow } from "@/modules/einvoicing/einvoice-list";
import { listEInvoices } from "@/modules/einvoicing/einvoice-service";

export default async function EInvoicingPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "sales");
  const rows = listEInvoices(businessId, user.id) as unknown as EInvoiceListRow[];
  return <div className="page-container page-wide">
    <div className="page-header"><div><h1 className="page-title">Electronic Invoices</h1><p className="page-description">Outbound PINT-AE XML for posted Sales Invoices and Sales Credit Notes. PDFs remain separate presentation documents.</p></div>{access.modules.includes("settings") && <Button asChild variant="secondary"><Link href={`/b/${businessId}/settings/einvoicing`}><Settings2 className="size-4" /> Settings</Link></Button>}</div>
    <EInvoiceList businessId={businessId} currency={access.business.currency} rows={rows} />
  </div>;
}
