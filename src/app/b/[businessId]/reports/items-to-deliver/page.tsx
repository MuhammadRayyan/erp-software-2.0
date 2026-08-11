import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate } from "@/core/format";
import { getItemsToDeliverReport } from "@/modules/inventory/inventory-report-service";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";

export default async function ItemsToDeliverPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const { user, access } = await requireModule(businessId, "reports");
  if (!access.modules.includes("inventory")) redirect(`/b/${businessId}/forbidden?module=inventory`);
  const rows = getItemsToDeliverReport(businessId, user.id);
  return <div className="page-container"><Link href={`/b/${businessId}/reports`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Reports</Link><div className="page-header"><div><h1 className="page-title">Items to Deliver</h1><p className="page-description">Outstanding inventory quantities on posted sales invoices.</p></div></div>{rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Sales Invoice</th><th>Customer</th><th>Item</th><th className="text-right!">Required</th><th className="text-right!">Delivered</th><th className="text-right!">Remaining</th><th>Due</th></tr></thead><tbody>{rows.map((row) => <tr key={row.sales_invoice_line_id}><td><Link href={`/b/${businessId}/sales/invoices/${row.sales_invoice_id}`} className="tabular font-medium text-primary hover:underline">{row.invoice_number}</Link></td><td>{row.customer_name}</td><td>{row.sku ? `${row.sku} · ` : ""}{row.item_name}</td><td className="money text-right">{formatQuantityMicros(row.required_micros)} {row.unit_name}</td><td className="money text-right">{formatQuantityMicros(row.delivered_micros)}</td><td className="money text-right font-medium">{formatQuantityMicros(row.required_micros - row.delivered_micros)}</td><td>{formatDate(row.due_date)}</td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">Nothing is waiting to be delivered</p><p className="mt-1 text-sm text-muted-foreground">Outstanding inventory sales-invoice lines appear here.</p></div>}</div>;
}
