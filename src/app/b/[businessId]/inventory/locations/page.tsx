import Link from "next/link";
import { Plus, MapPin } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listInventoryLocations } from "@/modules/inventory/inventory-location-service";
import { InventoryLocationTable, type InventoryLocationRow } from "@/modules/inventory/inventory-location-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = {
  title: "Inventory Locations",
};

export default async function InventoryLocationsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");
  const rows = listInventoryLocations(businessId, user.id) as unknown as InventoryLocationRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <PageHeader
        title="Inventory Locations"
        description="Warehouses, stores, and stock locations."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/inventory/locations/new`}>
            <Plus className="size-4" /> New Location
          </Link>
        </Button>
      </PageHeader>

      {rows.length ? (
        <InventoryLocationTable
          businessId={businessId}
          currency={access.business.currency}
          locations={rows}
          serverSnapshot={columnSnapshots["inventory-locations"]}
        />
      ) : (
        <EmptyState
          icon={<MapPin className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No locations yet"
          description="Create your first location to track inventory."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/inventory/locations/new`}>Create first Location</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
