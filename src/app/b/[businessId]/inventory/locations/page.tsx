import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import { listInventoryLocations } from "@/modules/inventory/inventory-location-service";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";

export default async function InventoryLocationsPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; const { user, access } = await requireModule(businessId, "inventory"); const rows = listInventoryLocations(businessId, user.id); return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Inventory Locations</h1><p className="page-description">Simple stock locations without bins or warehouse routing.</p></div><Button asChild><Link href={`/b/${businessId}/inventory/locations/new`}><Plus className="size-4" /> New Location</Link></Button></div><div className="data-panel overflow-x-auto"><table className="data-table min-w-[680px]"><thead><tr><th>Code</th><th>Location</th><th className="text-right!">Total Quantity</th><th className="text-right!">Value</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="tabular">{row.code}</td><td><Link href={`/b/${businessId}/inventory/locations/${row.id}`} className="font-medium text-primary hover:underline">{row.name}</Link>{row.is_default ? <Badge className="ml-2" tone="info">Default</Badge> : null}</td><td className="money text-right">{formatQuantityMicros(Number(row.quantity_micros))}</td><td className="money text-right">{formatMoney(Number(row.value_minor), access.business.currency)}</td><td><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></td></tr>)}</tbody></table></div></div>; }
