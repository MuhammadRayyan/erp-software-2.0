import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate } from "@/core/format";
import { getItemsToReceiveReport } from "@/modules/inventory/inventory-report-service";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";

export default async function ItemsToReceivePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const { user, access } = await requireModule(businessId, "reports");
  if (!access.modules.includes("inventory")) redirect(`/b/${businessId}/forbidden?module=inventory`);
  const rows = getItemsToReceiveReport(businessId, user.id);
  return <div className="page-container"><Link href={`/b/${businessId}/reports`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Reports</Link><div className="page-header"><div><h1 className="page-title">Items to Receive</h1><p className="page-description">Outstanding inventory quantities on issued purchase orders.</p></div></div>{rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Purchase Order</th><th>Supplier</th><th>Item</th><th className="text-right!">Ordered</th><th className="text-right!">Received</th><th className="text-right!">Remaining</th><th>Expected</th></tr></thead><tbody>{rows.map((row) => <tr key={row.purchase_order_line_id}><td><Link href={`/b/${businessId}/purchases/orders/${row.purchase_order_id}`} className="tabular font-medium text-primary hover:underline">{row.order_number}</Link></td><td>{row.supplier_name}</td><td>{row.sku ? `${row.sku} · ` : ""}{row.item_name}</td><td className="money text-right">{formatQuantityMicros(row.ordered_micros)} {row.unit_name}</td><td className="money text-right">{formatQuantityMicros(row.received_micros)}</td><td className="money text-right font-medium">{formatQuantityMicros(row.ordered_micros - row.received_micros)}</td><td>{row.expected_date ? formatDate(row.expected_date) : "—"}</td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">Nothing is waiting to be received</p><p className="mt-1 text-sm text-muted-foreground">Outstanding inventory purchase-order lines appear here.</p></div>}</div>;
}
