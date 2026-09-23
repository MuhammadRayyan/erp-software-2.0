import Link from "next/link";
import { requireModule } from "@/core/permissions/require-module";
import { InventoryLocationForm } from "@/modules/inventory/inventory-location-form";
import { BackLink } from "@/components/back-link";
export default async function NewLocationPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; await requireModule(businessId, "inventory"); return <div className="page-container"><BackLink href={`/b/${businessId}/inventory/locations`}>Inventory Locations</BackLink><div className="mb-7"><h1 className="page-title">New Inventory Location</h1><p className="page-description">Create a physical stock location.</p></div><InventoryLocationForm businessId={businessId} initial={{ code: "", name: "", address: "", isDefault: false, isActive: true }} /></div>; }
