import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { InventoryLocationForm } from "@/modules/inventory/inventory-location-form";
import { getInventoryLocation } from "@/modules/inventory/inventory-location-service";
export default async function EditLocationPage({ params }: { params: Promise<{ businessId: string; locationId: string }> }) { const { businessId, locationId } = await params; const { user } = await requireModule(businessId, "inventory"); const record = getInventoryLocation(businessId, user.id, locationId); if (!record) notFound(); const location = record.location; return <div className="page-container"><Link href={`/b/${businessId}/inventory/locations/${locationId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {String(location.name)}</Link><div className="mb-7"><h1 className="page-title">Edit Inventory Location</h1></div><InventoryLocationForm businessId={businessId} locationId={locationId} initial={{ code: String(location.code), name: String(location.name), address: String(location.address ?? ""), isDefault: Boolean(location.is_default), isActive: Boolean(location.is_active) }} /></div>; }
