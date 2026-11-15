import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { DATE_PATTERN } from "@/lib/params";
import { listGoodsReceipts } from "@/modules/inventory/goods-receipt-service";
import { GoodsReceiptTable, type GoodsReceiptRow } from "@/modules/inventory/goods-receipt-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = { title: "Goods Receipts" };

export default async function GoodsReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");
  const sp = await searchParams;
  const from = DATE_PATTERN.test(sp.from ?? "") ? sp.from : undefined;
  const to = DATE_PATTERN.test(sp.to ?? "") ? sp.to : undefined;

  const rows = listGoodsReceipts(businessId, user.id, { from, to }) as unknown as GoodsReceiptRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <Link
        href={`/b/${businessId}/inventory/items`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Inventory
      </Link>
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
          initialFrom={from}
          initialTo={to}
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
