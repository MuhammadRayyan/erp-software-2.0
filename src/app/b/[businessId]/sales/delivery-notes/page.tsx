import Link from "next/link";
import { Plus } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/empty-state";
import { ListDateFilter } from "@/components/list-date-filter";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import { buildDateSearchParams, DATE_PATTERN } from "@/lib/params";
import { listDeliveryNotes } from "@/modules/inventory/delivery-note-service";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";

export const metadata = { title: "Delivery Notes" };

export default async function DeliveryNotesPage({
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

  const rows = listDeliveryNotes(businessId, user.id, { from, to });
  const searchParamsUrl = buildDateSearchParams({ from, to });

  return (
    <div className="page-container">
      <BackLink href={`/b/${businessId}/inventory/items`}>Inventory</BackLink>
      <PageHeader title="Delivery Notes" description="Customer deliveries reduce stock and post moving-average Cost of Sales.">
        <Button asChild>
          <Link href={`/b/${businessId}/sales/delivery-notes/new`}>
            <Plus className="size-4" /> New Delivery Note
          </Link>
        </Button>
      </PageHeader>
      {rows.length ? (
        <div className="data-panel overflow-hidden">
          <ListDateFilter
            pathname={`/b/${businessId}/sales/delivery-notes`}
            searchParams={searchParamsUrl}
            initialFrom={from ?? ""}
            initialTo={to ?? ""}
            fromLabel="Delivery from"
            toLabel="Delivery to"
          />
          <div className="overflow-x-auto">
            <table className="data-table min-w-[800px]">
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Location</th>
                  <th className="text-right!">Quantity</th>
                  <th className="text-right!">COGS</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    <td>
                      <Link href={`/b/${businessId}/sales/delivery-notes/${String(row.id)}`} className="tabular font-medium text-primary hover:underline">
                        {String(row.delivery_number)}
                      </Link>
                    </td>
                    <td>{String(row.customer_name)}</td>
                    <td>{formatDate(String(row.date))}</td>
                    <td>{String(row.location_code)}</td>
                    <td className="money text-right">{formatQuantityMicros(Number(row.quantity_micros))}</td>
                    <td className="money text-right">{formatMoney(Number(row.value_minor), access.business.currency)}</td>
                    <td><StatusBadge status={String(row.document_status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No delivery notes yet"
          description="Create a delivery from a posted Sales Invoice or directly."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/sales/delivery-notes/new`}>Create Delivery Note</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
