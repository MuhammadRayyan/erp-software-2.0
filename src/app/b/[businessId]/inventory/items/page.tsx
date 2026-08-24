import Link from "next/link";
import { ClipboardPlus, Plus, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import { listInventoryItems } from "@/modules/inventory/inventory-item-service";
import { formatQuantityMicros, formatUnitCostMicros } from "@/modules/inventory/inventory-valuation";

export default async function InventoryItemsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ search?: string; active?: string }> }) {
  const { businessId } = await params; const query = await searchParams;
  const { user, access } = await requireModule(businessId, "inventory");
  const rows = listInventoryItems(businessId, user.id, { search: query.search, activeOnly: query.active === "1" });
  return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Inventory Items</h1><p className="page-description">Posted movement-derived stock with moving weighted-average valuation.</p></div><div className="flex gap-2"><Button asChild variant="secondary"><Link href={`/b/${businessId}/inventory/adjustments/new`}><ClipboardPlus className="size-4" /> Adjust Stock</Link></Button><Button asChild><Link href={`/b/${businessId}/inventory/items/new`}><Plus className="size-4" /> New Item</Link></Button></div></div>
    <form className="mb-3 flex flex-wrap items-center gap-2"><Input name="search" defaultValue={query.search} placeholder="Search items or SKU..." className="max-w-sm" /><label className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border-strong bg-surface px-3 text-sm"><input type="checkbox" name="active" value="1" defaultChecked={query.active === "1"} className="size-4 accent-[var(--primary)]" /> Active only</label><Button type="submit" variant="secondary"><SlidersHorizontal className="size-4" /> Apply</Button></form>
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[940px]"><thead><tr><th>SKU</th><th>Item</th><th className="text-right!">On Hand</th><th className="text-right!">Avg Cost</th><th className="text-right!">Value</th><th className="text-right!">To Receive</th><th className="text-right!">To Deliver</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td className="tabular text-muted-foreground">{String(row.sku ?? "—")}</td><td><Link href={`/b/${businessId}/inventory/items/${String(row.id)}`} className="font-medium text-primary hover:underline">{String(row.name)}</Link><span className="ml-2 text-xs text-muted-foreground">{String(row.unit_name)}</span></td><td className="money text-right">{formatQuantityMicros(Number(row.quantity_micros))} {String(row.unit_name)}</td><td className="money text-right">{formatUnitCostMicros(Number(row.average_unit_cost_micros), access.business.currency)}</td><td className="money text-right">{formatMoney(Number(row.value_minor), access.business.currency)}</td><td className="money text-right">{formatQuantityMicros(Number(row.to_receive_micros))}</td><td className="money text-right">{formatQuantityMicros(Number(row.to_deliver_micros))}</td><td><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title={query.search ? "No items match this search" : "No inventory items yet"} description={query.search ? "Clear the search or adjust the active filter." : "Create an item before receiving or delivering stock."} action={!query.search ? <Button asChild><Link href={`/b/${businessId}/inventory/items/new`}>Create first item</Link></Button> : undefined} />}
  </div>;
}
