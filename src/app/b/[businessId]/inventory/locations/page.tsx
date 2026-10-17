import Link from "next/link";
import { Plus, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import { listInventoryLocations } from "@/modules/inventory/inventory-location-service";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";
import { InventoryLocationRowActions } from "@/modules/inventory/inventory-location-row-actions";

export const metadata = {
  title: "Inventory Locations",
};

export default async function InventoryLocationsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");
  const rows = listInventoryLocations(businessId, user.id);

  return (
    <div className="page-container">
      <PageHeader
        title="Inventory Locations"
        description="Simple stock locations without bins or warehouse routing."
      >
        <Button asChild>
          <Link href={`/b/${businessId}/inventory/locations/new`}>
            <Plus className="size-4" /> New Location
          </Link>
        </Button>
      </PageHeader>
      
      {rows.length ? (
        <div className="data-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[680px]">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Location</th>
                  <th className="text-right!">Total Quantity</th>
                  <th className="text-right!">Value</th>
                  <th>Status</th>
                  <th className="w-16 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="tabular">{row.code}</td>
                    <td>
                      <Link href={`/b/${businessId}/inventory/locations/${row.id}`} className="font-medium text-primary hover:underline">
                        {row.name}
                      </Link>
                      {row.is_default ? (
                        <Badge className="ml-2" tone="info">
                          Default
                        </Badge>
                      ) : null}
                    </td>
                    <td className="money text-right">{formatQuantityMicros(Number(row.quantity_micros))}</td>
                    <td className="money text-right">{formatMoney(Number(row.value_minor), access.business.currency)}</td>
                    <td>
                      <StatusBadge status={row.is_active ? "active" : "inactive"} />
                    </td>
                    <td>
                      <InventoryLocationRowActions
                        businessId={businessId}
                        locationId={row.id}
                        locationName={row.name}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<MapPin className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No locations yet"
          description="Create your first location to track inventory."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/inventory/locations/new`}>Create first Location</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}