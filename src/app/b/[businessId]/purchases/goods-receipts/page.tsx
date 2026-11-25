import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listGoodsReceipts } from "@/modules/inventory/goods-receipt-service";
import { GoodsReceiptTable, type GoodsReceiptRow } from "@/modules/inventory/goods-receipt-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = { title: "Goods Receipts" };

export default async function GoodsReceiptsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");

  const rows = listGoodsReceipts(businessId, user.id) as unknown as GoodsReceiptRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <PageHeader
        title="Goods Receipts"
        description="Supplier receipts update physical stock valuation."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/purchases/goods-receipts/new`}>
            <Plus className="size-4" /> New Goods Receipt
          </Link>
        </Button>
      </PageHeader>

      {rows.length ? (
        <GoodsReceiptTable
          businessId={businessId}
          currency={access.business.currency}
          rows={rows}
          serverSnapshot={columnSnapshots["goods-receipts"]}
        />
      ) : (
        <EmptyState
          title="No goods receipts yet"
          description="Record a supplier receipt from a Purchase Order or directly."
          action={
            <Button permission="create" asChild>
              <Link href={`/b/${businessId}/purchases/goods-receipts/new`}>Create Goods Receipt</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
