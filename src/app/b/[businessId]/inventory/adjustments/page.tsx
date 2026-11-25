import Link from "next/link";
import { Plus, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listStockAdjustments } from "@/modules/inventory/stock-adjustment-service";
import { StockAdjustmentTable, type StockAdjustmentRow } from "@/modules/inventory/stock-adjustment-table";
import { listPreferences } from "@/modules/preferences/preference-service";
import { decodeColumnSnapshots } from "@/modules/preferences/snapshot-codec";

export const metadata = {
  title: "Stock Adjustments",
};

export default async function StockAdjustmentsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");
  const rows = listStockAdjustments(businessId, user.id) as unknown as StockAdjustmentRow[];
  const columnSnapshots = decodeColumnSnapshots(listPreferences(businessId, user.id));

  return (
    <div className="page-container">
      <PageHeader
        title="Stock Adjustments"
        description="Opening balances and controlled stock corrections."
      >
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/inventory/adjustments/new`}>
            <Plus className="size-4" /> New Adjustment
          </Link>
        </Button>
      </PageHeader>

      {rows.length ? (
        <StockAdjustmentTable
          businessId={businessId}
          currency={access.business.currency}
          rows={rows}
          serverSnapshot={columnSnapshots["stock-adjustments"]}
        />
      ) : (
        <EmptyState
          icon={<ClipboardList className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No stock adjustments yet"
          description="Use an Opening Balance to establish initial stock."
        />
      )}
    </div>
  );
}
