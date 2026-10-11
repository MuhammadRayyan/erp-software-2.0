import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { listCustomers } from "@/modules/customers/customer-service";
import { DeliveryNoteForm } from "@/modules/inventory/delivery-note-form";
import { getDeliverySourceLines } from "@/modules/inventory/delivery-note-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { getDefaultInventoryLocation, listInventoryLocations } from "@/modules/inventory/inventory-location-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { listInvoices } from "@/modules/sales-invoices/invoice-service";
import { getSalesOrder } from "@/modules/sales-orders/sales-order-service";

export default async function NewDeliveryNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ invoiceId?: string; orderId?: string; itemId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user } = await requireModule(businessId, "inventory");

  const items = listInventoryItemOptions(businessId, user.id);
  const locations = listInventoryLocations(businessId, user.id, true);
  const defaultLocation = getDefaultInventoryLocation(businessId, user.id);
  const customers = listCustomers(businessId, user.id);
  const invoices = listInvoices(businessId, user.id).filter((row) => row.documentStatus === "posted");
  const projects = listProjectOptions(businessId, user.id);

  const sourceRows = query.invoiceId ? getDeliverySourceLines(businessId, user.id, query.invoiceId) : [];
  const firstSource = sourceRows[0];
  const sourceInvoiceLines = sourceRows
    .filter((row) => Number(row.quantity_micros) > Number(row.completed_micros))
    .map((row) => ({
      itemId: String(row.item_id),
      description: String(row.description),
      quantity: quantityMicrosToInput(Number(row.quantity_micros) - Number(row.completed_micros)),
      projectId: String(row.project_id ?? ""),
      salesInvoiceLineId: String(row.source_line_id),
    }));

  const sourceOrder = query.orderId ? getSalesOrder(businessId, user.id, query.orderId) : null;
  const sourceOrderLines = sourceOrder
    ? sourceOrder.lines
        .filter((l) => Boolean(l.itemId))
        .map((line) => ({
          itemId: String(line.itemId),
          description: line.description,
          quantity: quantityMicrosToInput(line.quantityMicros),
          projectId: String(line.projectId ?? ""),
          salesInvoiceLineId: "",
        }))
    : [];

  const directItem = items.find((i) => i.id === query.itemId);
  const lines = sourceInvoiceLines.length
    ? sourceInvoiceLines
    : sourceOrderLines.length
    ? sourceOrderLines
    : [
        {
          itemId: directItem?.id ?? "",
          description: directItem?.name ?? "",
          quantity: "1",
          projectId: "",
          salesInvoiceLineId: "",
        },
      ];

  const sourceInvoice = invoices.find((invoice) => invoice.id === query.invoiceId);
  const customerId = String(
    firstSource?.customer_id ?? sourceInvoice?.customerId ?? sourceOrder?.order.customerId ?? ""
  );
  const projectId = String(
    firstSource?.header_project_id ?? sourceOrder?.order.projectId ?? ""
  );
  const reference = sourceInvoice?.invoiceNumber ?? sourceOrder?.order.orderNumber ?? "";

  const backHref = query.invoiceId
    ? `/b/${businessId}/sales/invoices/${query.invoiceId}`
    : query.orderId
    ? `/b/${businessId}/sales/orders/${query.orderId}`
    : `/b/${businessId}/sales/delivery-notes`;

  return (
    <div className="page-container">
      <Link
        href={backHref}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <div className="mb-7">
        <h1 className="page-title">New Delivery Note</h1>
        <p className="page-description">Post physical delivery and Cost of Sales together.</p>
      </div>
      <DeliveryNoteForm
        businessId={businessId}
        customers={customers.map(({ id, name }) => ({ id, name }))}
        locations={locations.map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        items={items.map(({ id, sku, name, unitName }) => ({ id, sku, name, unitName }))}
        invoices={invoices.map((row) => ({ id: row.id, number: row.invoiceNumber, customerId: row.customerId }))}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, customerId: p.customer_id }))}
        initial={{
          customerId,
          salesInvoiceId: query.invoiceId ?? "",
          date: new Date().toISOString().slice(0, 10),
          locationId: defaultLocation?.id ?? "",
          reference,
          projectId,
          notes: "",
          lines,
        }}
      />
    </div>
  );
}
