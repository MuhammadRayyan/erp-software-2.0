import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { InventoryLocationForm } from "@/modules/inventory/inventory-location-form";
export default async function NewLocationPage({ params }: { params: Promise<{ businessId: string }> }) { const { businessId } = await params; await requireModule(businessId, "inventory"); return <div className="page-container page-narrow"><Link href={`/b/${businessId}/inventory/locations`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Inventory Locations</Link><div className="mb-7"><h1 className="page-title">New Inventory Location</h1><p className="page-description">Create a physical stock location.</p></div><InventoryLocationForm businessId={businessId} initial={{ code: "", name: "", address: "", isDefault: false, isActive: true }} /></div>; }
