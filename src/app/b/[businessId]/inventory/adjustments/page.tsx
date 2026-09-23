import Link from "next/link";
import { ArrowLeft, Plus, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";
import { listStockAdjustments } from "@/modules/inventory/stock-adjustment-service";

export const metadata = {
  title: "Stock Adjustments",
};

export default async function StockAdjustmentsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "inventory");
  const rows = listStockAdjustments(businessId, user.id);

  return (
    <div className="page-container">
      <Link href={`/b/${businessId}/inventory/items`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Inventory Items
      </Link>
      
      <PageHeader
        title="Stock Adjustments"
        description="Opening balances and controlled stock corrections."
      >
        <Button asChild>
          <Link href={`/b/${businessId}/inventory/adjustments/new`}>
            <Plus className="size-4" /> New Adjustment
          </Link>
        </Button>
      </PageHeader>

      {rows.length ? (
        <div className="data-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[780px]">
              <thead>
                <tr>
                  <th>Adjustment</th>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Reason</th>
                  <th className="text-right!">Quantity</th>
                  <th className="text-right!">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    <td>
                      <Link href={`/b/${businessId}/inventory/adjustments/${String(row.id)}`} className="tabular font-medium text-primary hover:underline">
                        {String(row.adjustment_number)}
                      </Link>
                    </td>
                    <td>{formatDate(String(row.date))}</td>
                    <td>{String(row.item_name)}</td>
                    <td>{String(row.location_code)}</td>
                    <td>{String(row.reason)}</td>
                    <td className="money text-right">
                      {formatQuantityMicros(Number(row.quantity_delta_micros))} {String(row.unit_name)}
                    </td>
                    <td className="money text-right">
                      {formatMoney(Number(row.value_minor), access.business.currency)}
                    </td>
                    <td>
                      <StatusBadge status={String(row.document_status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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