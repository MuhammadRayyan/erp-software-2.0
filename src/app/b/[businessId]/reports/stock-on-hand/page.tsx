import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import { listInventoryItems } from "@/modules/inventory/inventory-item-service";
import { listInventoryLocations } from "@/modules/inventory/inventory-location-service";
import { getStockOnHandReport } from "@/modules/inventory/inventory-report-service";
import { formatQuantityMicros, formatUnitCostMicros } from "@/modules/inventory/inventory-valuation";
import { SelectNative } from "@/components/ui/select-native";


export default async function StockOnHandPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ itemId?: string; locationId?: string; active?: string }> }) {
  const { businessId } = await params; const filters = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  if (!access.modules.includes("inventory")) redirect(`/b/${businessId}/forbidden?module=inventory`);
  const items = listInventoryItems(businessId, user.id); const locations = listInventoryLocations(businessId, user.id);
  const rows = getStockOnHandReport(businessId, user.id, { itemId: filters.itemId, locationId: filters.locationId, activeOnly: filters.active === "1" });
  return <div className="page-container"><Link href={`/b/${businessId}/reports`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Reports</Link><div className="page-header"><div><h1 className="page-title">Stock On Hand</h1><p className="page-description">Current quantity and moving weighted-average value by location.</p></div></div>
    <form className="mb-3 flex flex-wrap items-end gap-3"><label className="space-y-1 text-xs text-muted-foreground">Item<SelectNative name="itemId" defaultValue={filters.itemId ?? ""} className="mt-1 block min-w-56"><option value="">All items</option>{items.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.sku ?? "No SKU")} · {String(item.name)}</option>)}</SelectNative></label><label className="space-y-1 text-xs text-muted-foreground">Location<SelectNative name="locationId" defaultValue={filters.locationId ?? ""} className="mt-1 block min-w-48"><option value="">All locations</option>{locations.map((location) => <option key={String(location.id)} value={String(location.id)}>{String(location.code)} · {String(location.name)}</option>)}</SelectNative></label><label className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-sm"><input type="checkbox" name="active" value="1" defaultChecked={filters.active === "1"} className="size-4 accent-[var(--primary)]" /> Active only</label><Button type="submit" variant="secondary">Apply</Button></form>
    {rows.length ? <div className="data-panel overflow-x-auto"><table className="data-table min-w-[820px]"><thead><tr><th>Item</th><th>SKU</th><th>Location</th><th className="text-right!">Quantity</th><th className="text-right!">Average Cost</th><th className="text-right!">Inventory Value</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.item_id}-${row.location_id}`}><td><Link href={`/b/${businessId}/inventory/items/${row.item_id}`} className="font-medium text-primary hover:underline">{row.item_name}</Link></td><td className="tabular text-muted-foreground">{row.sku ?? "—"}</td><td>{row.location_code} · {row.location_name}</td><td className="money text-right">{formatQuantityMicros(row.quantity_micros)} {row.unit_name}</td><td className="money text-right">{formatUnitCostMicros(row.average_unit_cost_micros, access.business.currency)}</td><td className="money text-right">{formatMoney(row.value_minor, access.business.currency)}</td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-border bg-surface py-10 text-center"><p className="font-medium">No stock matches these filters</p><p className="mt-1 text-sm text-muted-foreground">Posted inventory movements appear here.</p></div>}
  </div>;
}
