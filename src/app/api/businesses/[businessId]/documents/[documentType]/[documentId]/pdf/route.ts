import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { formatDate, formatMoney } from "@/core/format";
import {
  getDocumentPdfAccess,
  getDocumentPdfModule,
} from "@/core/permissions/document-pdf-access";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { renderDocumentPdf } from "@/modules/document-templates/pdf-engine";
import { getInvoiceTemplate } from "@/modules/document-templates/template-service";
import { getPurchaseInvoice } from "@/modules/purchase-invoices/purchase-invoice-service";
import { getPurchaseOrder } from "@/modules/purchase-orders/purchase-order-service";
import { getCreditNote } from "@/modules/sales-credit-notes/credit-note-service";
import { getGoodsReceipt } from "@/modules/inventory/goods-receipt-service";
import { getDeliveryNote } from "@/modules/inventory/delivery-note-service";
import { averageUnitCostMicros, formatUnitCostMicros } from "@/modules/inventory/inventory-valuation";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string; documentType: string; documentId: string }> }) {
  const session = await getCurrentSession(); if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId, documentType, documentId } = await params;
  if (!getDocumentPdfModule(documentType)) {
    return NextResponse.json({ error: "Unsupported document type" }, { status: 404 });
  }
  const access = getDocumentPdfAccess(businessId, session.user.id, documentType);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let currency = access.business.currency;
  let title: string; let number: string; let partyLabel = "SUPPLIER"; let partyName: string; let dateLabel: string; let dueLabel: string; let subtotalMinor: number; let taxMinor: number; let totalMinor: number; let rows: string[][];
  if (documentType === "purchase-order") {
    const record = getPurchaseOrder(businessId, session.user.id, documentId); if (!record) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    currency = record.order.currencyCode; title = "PURCHASE ORDER"; number = record.order.orderNumber; partyName = record.supplier.name; dateLabel = `Order date: ${formatDate(record.order.date)}`; dueLabel = record.order.expectedDate ? `Expected: ${formatDate(record.order.expectedDate)}` : "Expected: —"; if (currency !== access.business.currency) dueLabel += ` · Rate 1 ${currency} = ${record.order.exchangeRateToBase} ${access.business.currency} · Base ${formatMoney(record.order.baseTotalMinor, access.business.currency)}`; subtotalMinor = record.order.subtotalMinor; taxMinor = record.order.taxMinor; totalMinor = record.order.totalMinor; rows = record.lines.map((line) => [line.description, quantityMicrosToInput(line.quantityMicros), formatMoney(line.unitPriceMinor, currency), formatMoney(line.grossAmountMinor, currency)]);
  } else if (documentType === "purchase-invoice") {
    const record = getPurchaseInvoice(businessId, session.user.id, documentId); if (!record) return NextResponse.json({ error: "Purchase invoice not found" }, { status: 404 });
    currency = record.invoice.currencyCode; title = "PURCHASE INVOICE"; number = record.invoice.internalNumber; partyName = record.supplier.name; dateLabel = `Invoice date: ${formatDate(record.invoice.invoiceDate)}`; dueLabel = `Due date: ${formatDate(record.invoice.dueDate)}`; if (currency !== access.business.currency) dueLabel += ` · Rate 1 ${currency} = ${record.invoice.exchangeRateToBase} ${access.business.currency} (${record.invoice.exchangeRateSource}, ${record.invoice.exchangeRateDate}) · Base ${formatMoney(record.invoice.baseTotalMinor, access.business.currency)} · ${access.business.currency} VAT ${formatMoney(record.invoice.baseTaxMinor, access.business.currency)}`; subtotalMinor = record.invoice.subtotalMinor; taxMinor = record.invoice.taxMinor; totalMinor = record.invoice.totalMinor; rows = record.lines.map((line) => [line.description, quantityMicrosToInput(line.quantityMicros), formatMoney(line.unitPriceMinor, currency), formatMoney(line.grossAmountMinor, currency)]);
  } else if (documentType === "sales-credit-note") {
    const record = getCreditNote(businessId, session.user.id, documentId); if (!record) return NextResponse.json({ error: "Credit note not found" }, { status: 404 });
    currency = record.note.currencyCode; title = "SALES CREDIT NOTE"; number = record.note.creditNoteNumber; partyLabel = "CREDIT TO"; partyName = record.customer.name; dateLabel = `Credit date: ${formatDate(record.note.date)}`; dueLabel = `Invoice: ${record.invoice.invoiceNumber}`; if (currency !== access.business.currency) dueLabel += ` · Original rate 1 ${currency} = ${record.note.exchangeRateToBase} ${access.business.currency} (${record.note.exchangeRateSource}, ${record.note.exchangeRateDate}) · Base carrying reduction ${formatMoney(record.note.baseTotalMinor, access.business.currency)} · ${access.business.currency} VAT ${formatMoney(record.note.baseTaxMinor, access.business.currency)}`; subtotalMinor = record.note.subtotalMinor; taxMinor = record.note.taxMinor; totalMinor = record.note.totalMinor; rows = record.lines.map((line) => [line.description, quantityMicrosToInput(line.quantityMicros), formatMoney(line.unitPriceMinor, currency), formatMoney(line.grossAmountMinor, currency)]);
  } else if (documentType === "goods-receipt") {
    const record = getGoodsReceipt(businessId, session.user.id, documentId); if (!record) return NextResponse.json({ error: "Goods Receipt not found" }, { status: 404 });
    title = "GOODS RECEIPT"; number = String(record.receipt.receipt_number); partyName = String(record.receipt.supplier_name); dateLabel = `Receipt date: ${formatDate(String(record.receipt.date))}`; dueLabel = `Location: ${String(record.receipt.location_code)} · ${String(record.receipt.location_name)}`; taxMinor = 0; totalMinor = record.lines.reduce((sum, line) => sum + Number(line.value_minor), 0); subtotalMinor = totalMinor; rows = record.lines.map((line) => [`${String(line.sku ?? "")} ${String(line.item_name)}`.trim(), quantityMicrosToInput(Number(line.quantity_micros)), formatMoney(Number(line.unit_cost_minor), currency), formatMoney(Number(line.value_minor), currency)]);
  } else if (documentType === "delivery-note") {
    const record = getDeliveryNote(businessId, session.user.id, documentId); if (!record) return NextResponse.json({ error: "Delivery Note not found" }, { status: 404 });
    title = "DELIVERY NOTE"; number = String(record.delivery.delivery_number); partyLabel = "DELIVER TO"; partyName = String(record.delivery.customer_name); dateLabel = `Delivery date: ${formatDate(String(record.delivery.date))}`; dueLabel = `Location: ${String(record.delivery.location_code)} · ${String(record.delivery.location_name)}`; taxMinor = 0; totalMinor = record.lines.reduce((sum, line) => sum + Number(line.value_minor), 0); subtotalMinor = totalMinor; rows = record.lines.map((line) => [`${String(line.sku ?? "")} ${String(line.item_name)}`.trim(), quantityMicrosToInput(Number(line.quantity_micros)), formatUnitCostMicros(averageUnitCostMicros(Number(line.value_minor), Number(line.quantity_micros)), currency), formatMoney(Number(line.value_minor), currency)]);
  } else return NextResponse.json({ error: "Unsupported document type" }, { status: 404 });
  try {
    const pdf = await renderDocumentPdf(getInvoiceTemplate(businessId, session.user.id), { companyName: access.business.name, invoiceTitle: title, invoiceNumber: number, customerLabel: partyLabel, customerName: partyName, invoiceDate: dateLabel, dueDate: dueLabel, itemsTable: JSON.stringify(rows), subtotal: `Subtotal    ${formatMoney(subtotalMinor, currency)}`, vat: `VAT             ${formatMoney(taxMinor, currency)}`, total: `TOTAL        ${formatMoney(totalMinor, currency)}` });
    return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${number}.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "PDF generation failed" }, { status: 500 }); }
}
