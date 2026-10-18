import Link from "next/link";
import { notFound } from "next/navigation";
import { NoticeToast } from "@/components/notice-toast";
import { StatusBadge } from "@/components/status-badge";
import { requireModule } from "@/core/permissions/require-module";
import { formatDate, formatMoney } from "@/core/format";
import type { InventoryDocumentStatus } from "@/modules/inventory/inventory-document";
import { getDeliveryNote } from "@/modules/inventory/delivery-note-service";
import { DeliveryNoteViewActions } from "@/modules/inventory/delivery-note-view-actions";
import { formatQuantityMicros } from "@/modules/inventory/inventory-valuation";
import { BackLink } from "@/components/back-link";
import { getDocumentViewData } from "@/modules/document-templates/document-data-extractor";
import { DocumentViewLayout } from "@/modules/document-templates/components/document-view-layout";

export default async function DeliveryNoteViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; deliveryId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { businessId, deliveryId } = await params;
  const { notice } = await searchParams;
  const { user, access } = await requireModule(businessId, "inventory");
  const record = getDeliveryNote(businessId, user.id, deliveryId);
  if (!record) notFound();
  const d = record.delivery;
  const status = String(d.document_status) as InventoryDocumentStatus;
  const total = record.lines.reduce((sum, line) => sum + Number(line.value_minor), 0);

  const viewBundle = getDocumentViewData(
    businessId,
    user.id,
    access.business.name,
    access.business.currency,
    "delivery-note",
    deliveryId
  );

  return (
    <div className="page-container">
      <NoticeToast message={notice} />
      <BackLink href={`/b/${businessId}/sales/delivery-notes`}>Delivery Notes</BackLink>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title tabular">{String(d.delivery_number)}</h1>
            <StatusBadge status={status} />
          </div>
          <p className="mt-2 font-medium">
            {(d as any).customer_id ? (
              <Link href={`/b/${businessId}/customers/${String((d as any).customer_id)}`} className="hover:text-primary hover:underline transition-colors">
                {String(d.customer_name)}
              </Link>
            ) : (
              String(d.customer_name)
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(String(d.date))} · {String(d.location_code)} {String(d.location_name)}
          </p>
          <p className="money mt-3 text-xl font-semibold">
            COGS {formatMoney(total, access.business.currency)}
          </p>
        </div>
        <DeliveryNoteViewActions
          businessId={businessId}
          deliveryId={deliveryId}
          number={String(d.delivery_number)}
          status={status}
          journalId={record.journal?.id ?? null}
        />
      </div>

      <DocumentViewLayout
        data={viewBundle.data}
        settings={viewBundle.settings}
        variant={viewBundle.variant}
        pdfUrl={viewBundle.pdfUrl}
        documentNumber={String(d.delivery_number)}
      >
        <article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">
          <dl className="grid gap-3 border-b border-border pb-5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Sales Invoice</dt>
              <dd className="mt-1">
                {d.sales_invoice_id ? (
                  <Link
                    href={`/b/${businessId}/sales/invoices/${String(d.sales_invoice_id)}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {String(d.invoice_number)}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd className="mt-1">{String(d.reference ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Journal</dt>
              <dd className="mt-1">
                {record.journal ? (
                  <Link
                    href={`/b/${businessId}/accounting/journal/${record.journal.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {record.journal.entry_number}
                  </Link>
                ) : (
                  "Not posted"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Valuation</dt>
              <dd className="mt-1">Moving weighted average</dd>
            </div>
          </dl>
          <div className="mt-6 overflow-x-auto">
            <table className="data-table min-w-[700px]">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th className="text-right!">Quantity</th>
                  <th className="text-right!">COGS</th>
                </tr>
              </thead>
              <tbody>
                {record.lines.map((line) => (
                  <tr key={String(line.id)}>
                    <td>
                      <Link
                        href={`/b/${businessId}/inventory/items/${String(line.item_id)}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {String(line.sku ?? line.item_name)}
                      </Link>
                    </td>
                    <td>{String(line.description)}</td>
                    <td className="money text-right">
                      {formatQuantityMicros(Number(line.quantity_micros))} {String(line.unit_name)}
                    </td>
                    <td className="money text-right">
                      {formatMoney(Number(line.value_minor), access.business.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.notes && (
            <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">
              {String(d.notes)}
            </p>
          )}
        </article>
      </DocumentViewLayout>
    </div>
  );
}
