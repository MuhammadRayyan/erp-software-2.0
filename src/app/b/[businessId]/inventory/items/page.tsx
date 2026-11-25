import Link from "next/link";
import { ClipboardPlus, Package, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listInventoryItems } from "@/modules/inventory/inventory-item-service";
import { InventoryItemTable, type InventoryItemRow } from "@/modules/inventory/inventory-item-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = {
  title: "Inventory Items",
};

export default async function InventoryItemsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");
  const rows = listInventoryItems(businessId, user.id) as unknown as InventoryItemRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <PageHeader
        title="Inventory Items"
        description="Stock on hand and moving weighted-average valuation."
      >
        <Button permission="create" asChild variant="secondary">
          <Link href={`/b/${businessId}/inventory/adjustments/new`}>
            <ClipboardPlus className="size-4" /> Adjust Stock
          </Link>
        </Button>
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/inventory/items/new`}>
            <Plus className="size-4" /> New Item
          </Link>
        </Button>
      </PageHeader>

      {rows.length ? (
        <InventoryItemTable
          businessId={businessId}
          currency={access.business.currency}
          items={rows}
          serverSnapshot={columnSnapshots["inventory-items"]}
        />
      ) : (
        <EmptyState
          icon={<Package className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No inventory items yet"
          description="Create an item before receiving or delivering stock."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/inventory/items/new`}>Create first item</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
