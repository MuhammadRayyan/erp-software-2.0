import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import { buildDateSearchParams, DATE_PATTERN } from "@/lib/params";
import { listGoodsReceipts } from "@/modules/inventory/goods-receipt-service";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";

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

  const rows = listGoodsReceipts(businessId, user.id, { from, to });
  const searchParamsUrl = buildDateSearchParams({ from, to });

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
        description="Supplier receipts change physical stock without duplicating AP accounting."
      >
        <Button asChild>
          <Link href={`/b/${businessId}/purchases/goods-receipts/new`}>
            <Plus className="size-4" /> New Goods Receipt
          </Link>
        </Button>
      </PageHeader>
      
      {rows.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/purchases/goods-receipts`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Receipt from"
            toLabel="Receipt to"
          />
          <div className="overflow-x-auto">
            <table className="data-table min-w-[800px]">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Location</th>
                  <th className="text-right!">Quantity</th>
                  <th className="text-right!">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    <td>
                      <Link
                        href={`/b/${businessId}/purchases/goods-receipts/${String(row.id)}`}
                        className="tabular font-medium text-primary hover:underline"
                      >
                        {String(row.receipt_number)}
                      </Link>
                    </td>
                    <td>{String(row.supplier_name)}</td>
                    <td>{formatDate(String(row.date))}</td>
                    <td>{String(row.location_code)}</td>
                    <td className="money text-right">
                      {formatQuantityMicros(Number(row.quantity_micros))}
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
          title="No goods receipts yet"
          description="Receive against a Purchase Order or create a direct receipt."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/purchases/goods-receipts/new`}>
                Create Goods Receipt
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
