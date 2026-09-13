import { formatDate, formatMoney } from "@/core/format";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { renderDocumentPdf } from "@/modules/document-templates/template-registry";
import { getPurchaseInvoice } from "@/modules/purchase-invoices/purchase-invoice-service";
import { getPurchaseOrder } from "@/modules/purchase-orders/purchase-order-service";
import { getCreditNote } from "@/modules/sales-credit-notes/credit-note-service";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";
import { getSalesQuote } from "@/modules/sales-quotes/quote-service";
import { getSalesOrder } from "@/modules/sales-orders/sales-order-service";
import { getPurchaseQuote } from "@/modules/purchase-quotes/purchase-quote-service";
import { getGoodsReceipt } from "@/modules/inventory/goods-receipt-service";
import { getDeliveryNote } from "@/modules/inventory/delivery-note-service";
import { getDebitNote } from "@/modules/debit-notes/debit-note-service";
import { averageUnitCostMicros, formatUnitCostMicros } from "@/modules/inventory/inventory-valuation";
import { getCustomFieldPairsForEntity } from "@/modules/custom-fields/custom-field-service";

export async function generateDocumentPdf(
  businessId: string,
  userId: string,
  businessName: string,
  baseCurrency: string,
  documentType: string,
  documentId: string
): Promise<{ pdf: Buffer; filename: string }> {
  let currency = baseCurrency;
  let title = "";
  let number = "";
  let partyLabel = "BILL TO";
  let partyName = "";
  let dateLabel = "";
  let dueLabel = "";
  let status: string | undefined = undefined;
  let subtotalMinor = 0;
  let taxMinor = 0;
  let totalMinor = 0;
  let rows: any[] = [];
  let customFields: { name: string; value: string }[] = [];

  if (documentType === "sales-invoice") {
    const record = getInvoice(businessId, userId, documentId);
    if (!record) throw new Error("Invoice not found");
    currency = record.invoice.currencyCode;
    title = "INVOICE";
    number = record.invoice.invoiceNumber;
    partyName = record.customer.name;
    dateLabel = formatDate(record.invoice.invoiceDate);
    dueLabel = `Due: ${formatDate(record.invoice.dueDate)}`;
    if (currency !== baseCurrency) {
      dueLabel += ` - Rate 1 ${currency} = ${record.invoice.exchangeRateToBase} ${baseCurrency} (${record.invoice.exchangeRateSource}, ${record.invoice.exchangeRateDate}) - Base ${formatMoney(record.invoice.baseTotalMinor, baseCurrency)} - ${baseCurrency} VAT ${formatMoney(record.invoice.baseTaxMinor, baseCurrency)}`;
    }
    subtotalMinor = record.invoice.subtotalMinor;
    taxMinor = record.invoice.taxMinor;
    totalMinor = record.invoice.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
    customFields = getCustomFieldPairsForEntity(businessId, userId, "sales_invoice", record.invoice.id);
  } else if (documentType === "purchase-invoice") {
    const record = getPurchaseInvoice(businessId, userId, documentId);
    if (!record) throw new Error("Purchase invoice not found");
    currency = record.invoice.currencyCode;
    title = "PURCHASE INVOICE";
    number = record.invoice.internalNumber;
    partyLabel = "SUPPLIER";
    partyName = record.supplier.name;
    dateLabel = formatDate(record.invoice.invoiceDate);
    dueLabel = `Due: ${formatDate(record.invoice.dueDate)} (Ref: ${record.invoice.supplierInvoiceNumber || "-"})`;
    if (currency !== baseCurrency) {
      dueLabel += ` - Rate 1 ${currency} = ${record.invoice.exchangeRateToBase} ${baseCurrency} (${record.invoice.exchangeRateSource}, ${record.invoice.exchangeRateDate}) - Base ${formatMoney(record.invoice.baseTotalMinor, baseCurrency)} - ${baseCurrency} VAT ${formatMoney(record.invoice.baseTaxMinor, baseCurrency)}`;
    }
    subtotalMinor = record.invoice.subtotalMinor;
    taxMinor = record.invoice.taxMinor;
    totalMinor = record.invoice.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
    // customFields = getCustomFieldPairsForEntity(businessId, userId, "purchase_invoice", record.invoice.id);
  } else if (documentType === "purchase-order") {
    const record = getPurchaseOrder(businessId, userId, documentId);
    if (!record) throw new Error("Purchase order not found");
    currency = record.order.currencyCode;
    title = "PURCHASE ORDER";
    number = record.order.orderNumber;
    status = (record.order as any).status;
    partyLabel = "SUPPLIER";
    partyName = record.supplier.name;
    dateLabel = formatDate((record.order as any).date || (record.order as any).orderDate);
    dueLabel = (record.order as any).expectedDate ? `Expected Date: ${formatDate((record.order as any).expectedDate)}` : (record.order as any).deliveryDate ? `Delivery Date: ${formatDate((record.order as any).deliveryDate)}` : "-";
    if (currency !== baseCurrency) {
      dueLabel += ` - Rate 1 ${currency} = ${record.order.exchangeRateToBase} ${baseCurrency} - Base ${formatMoney(record.order.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.order.subtotalMinor;
    taxMinor = record.order.taxMinor;
    totalMinor = record.order.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
  } else if (documentType === "sales-credit-note") {
    const record = getCreditNote(businessId, userId, documentId);
    if (!record) throw new Error("Credit note not found");
    currency = record.note.currencyCode;
    title = "SALES CREDIT NOTE";
    number = record.note.creditNoteNumber;
    partyLabel = "CREDIT TO";
    partyName = record.customer.name;
    dateLabel = formatDate(record.note.date);
    dueLabel = `Invoice: ${record.invoice.invoiceNumber}`;
    if (currency !== baseCurrency) {
      dueLabel += ` - Original rate 1 ${currency} = ${record.note.exchangeRateToBase} ${baseCurrency} (${record.note.exchangeRateSource}, ${record.note.exchangeRateDate}) - Base carrying reduction ${formatMoney(record.note.baseTotalMinor, baseCurrency)} - ${baseCurrency} VAT ${formatMoney(record.note.baseTaxMinor, baseCurrency)}`;
    }
    subtotalMinor = record.note.subtotalMinor;
    taxMinor = record.note.taxMinor;
    totalMinor = record.note.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
  } else if (documentType === "debit-note") {
    const record = getDebitNote(businessId, userId, documentId);
    if (!record) throw new Error("Debit note not found");
    currency = record.note.currencyCode;
    title = "DEBIT NOTE";
    number = record.note.debitNoteNumber;
    partyLabel = "SUPPLIER";
    partyName = record.note.supplierName;
    dateLabel = formatDate(record.note.debitNoteDate);
    dueLabel = "-";
    subtotalMinor = record.note.subtotalMinor;
    taxMinor = record.note.taxMinor;
    totalMinor = record.note.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description || "-",
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
  } else if (documentType === "sales-quote") {
    const record = getSalesQuote(businessId, userId, documentId);
    if (!record) throw new Error("Quote not found");
    currency = record.quote.currencyCode;
    title = "SALES QUOTE";
    number = record.quote.quoteNumber;
    status = (record.quote as any).documentStatus;
    partyName = record.customer.name;
    dateLabel = formatDate(record.quote.quoteDate);
    dueLabel = record.quote.expiryDate ? `Expiry Date: ${formatDate(record.quote.expiryDate)}` : "-";
    if (currency !== baseCurrency) {
      dueLabel += ` - Rate 1 ${currency} = ${record.quote.exchangeRateToBase} ${baseCurrency} - Base ${formatMoney(record.quote.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.quote.subtotalMinor;
    taxMinor = record.quote.taxMinor;
    totalMinor = record.quote.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
  } else if (documentType === "sales-order") {
    const record = getSalesOrder(businessId, userId, documentId);
    if (!record) throw new Error("Sales order not found");
    currency = record.order.currencyCode;
    title = "SALES ORDER";
    number = record.order.orderNumber;
    status = (record.order as any).documentStatus;
    partyName = record.customer.name;
    dateLabel = formatDate(record.order.orderDate);
    dueLabel = record.order.deliveryDate ? `Delivery Date: ${formatDate(record.order.deliveryDate)}` : "-";
    if (currency !== baseCurrency) {
      dueLabel += ` - Rate 1 ${currency} = ${record.order.exchangeRateToBase} ${baseCurrency} - Base ${formatMoney(record.order.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.order.subtotalMinor;
    taxMinor = record.order.taxMinor;
    totalMinor = record.order.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
  } else if (documentType === "purchase-quote") {
    const record = getPurchaseQuote(businessId, userId, documentId);
    if (!record) throw new Error("Purchase quote not found");
    currency = record.quote.currencyCode;
    title = "PURCHASE QUOTE";
    number = record.quote.quoteNumber;
    status = (record.quote as any).documentStatus;
    partyLabel = "SUPPLIER";
    partyName = record.supplier.name;
    dateLabel = formatDate(record.quote.quoteDate);
    dueLabel = record.quote.expiryDate ? `Expiry Date: ${formatDate(record.quote.expiryDate)}` : "-";
    if (currency !== baseCurrency) {
      dueLabel += ` - Rate 1 ${currency} = ${record.quote.exchangeRateToBase} ${baseCurrency} - Base ${formatMoney(record.quote.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.quote.subtotalMinor;
    taxMinor = record.quote.taxMinor;
    totalMinor = record.quote.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount: (line as any).discountType === "percentage" ? `${(line as any).discountValue}%` : ((line as any).discountType === "fixed" ? formatMoney(Number((line as any).discountValue), currency) : undefined),
    }));
  } else if (documentType === "goods-receipt") {
    const record = getGoodsReceipt(businessId, userId, documentId);
    if (!record) throw new Error("Goods Receipt not found");
    title = "GOODS RECEIPT";
    number = String(record.receipt.receipt_number);
    partyLabel = "SUPPLIER";
    partyName = String(record.receipt.supplier_name);
    dateLabel = formatDate(String(record.receipt.date));
    dueLabel = `Location: ${String(record.receipt.location_code)} - ${String(record.receipt.location_name)}`;
    taxMinor = 0;
    totalMinor = record.lines.reduce((sum, line) => sum + Number(line.value_minor), 0);
    subtotalMinor = totalMinor;
    rows = record.lines.map((line) => ({
      description: `${String(line.sku ?? "")} ${String(line.item_name)}`.trim(),
      quantity: quantityMicrosToInput(Number(line.quantity_micros)),
      unitPrice: formatMoney(Number(line.unit_cost_minor), currency),
      amount: formatMoney(Number(line.value_minor), currency),
    }));
  } else if (documentType === "delivery-note") {
    const record = getDeliveryNote(businessId, userId, documentId);
    if (!record) throw new Error("Delivery Note not found");
    title = "DELIVERY NOTE";
    number = String(record.delivery.delivery_number);
    partyLabel = "DELIVER TO";
    partyName = String(record.delivery.customer_name);
    dateLabel = formatDate(String(record.delivery.date));
    dueLabel = `Location: ${String(record.delivery.location_code)} - ${String(record.delivery.location_name)}`;
    taxMinor = 0;
    totalMinor = record.lines.reduce((sum, line) => sum + Number(line.value_minor), 0);
    subtotalMinor = totalMinor;
    rows = record.lines.map((line) => ({
      description: `${String(line.sku ?? "")} ${String(line.item_name)}`.trim(),
      quantity: quantityMicrosToInput(Number(line.quantity_micros)),
      unitPrice: formatUnitCostMicros(averageUnitCostMicros(Number(line.value_minor), Number(line.quantity_micros)), currency),
      amount: formatMoney(Number(line.value_minor), currency),
    }));
  } else {
    throw new Error("Unsupported document type");
  }

  const data = {
    companyName: businessName,
    invoiceTitle: title,
    invoiceNumber: number,
    customerLabel: partyLabel,
    customerName: partyName,
    invoiceDate: dateLabel,
    dueDate: dueLabel,
    lines: rows,
    subtotal: formatMoney(subtotalMinor, currency),
    tax: formatMoney(taxMinor, currency),
    total: formatMoney(totalMinor, currency),
    customFields: customFields.length ? customFields : undefined,
    status,
  };

  const pdf = await renderDocumentPdf(businessId, userId, documentType, data);
  return { pdf: Buffer.from(pdf), filename: `${number}.pdf` };
}
