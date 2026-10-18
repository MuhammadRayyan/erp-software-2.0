import { formatDate, formatMoney } from "@/core/format";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
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
import { getReceipt } from "@/modules/receipts/receipt-service";
import { getSupplierPayment } from "@/modules/supplier-payments/supplier-payment-service";
import { averageUnitCostMicros, formatUnitCostMicros } from "@/modules/inventory/inventory-valuation";
import { getCustomFieldPairsForEntity } from "@/modules/custom-fields/custom-field-service";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { getTemplateSettings } from "./template-service";
import { type TemplateSettings } from "./template-settings";
import type { DocumentTemplateData, DocumentTemplateVariant } from "./types";

export interface ExtractedDocumentData {
  data: DocumentTemplateData;
  filename: string;
  number: string;
  currency: string;
  title: string;
  status?: string;
  totalMinor: number;
}

export interface DocumentViewBundle extends ExtractedDocumentData {
  settings: TemplateSettings;
  variant: DocumentTemplateVariant;
  documentType: string;
  documentId: string;
  pdfUrl: string;
}

export function resolveDocumentVariant(
  documentType: string,
  settings: TemplateSettings,
  data: { invoiceTitle?: string; customerLabel?: string }
): DocumentTemplateVariant {
  const showDueDate = [
    "sales-invoice",
    "purchase-invoice",
    "sales-quote",
    "purchase-quote",
    "sales-order",
    "purchase-order",
  ].includes(documentType);

  const showTax = [
    "sales-invoice",
    "purchase-invoice",
    "sales-quote",
    "purchase-quote",
    "sales-order",
    "purchase-order",
    "sales-credit-note",
    "debit-note",
  ].includes(documentType);

  const showBuyerTrn = [
    "sales-invoice",
    "sales-quote",
    "sales-order",
    "sales-credit-note",
  ].includes(documentType);

  return {
    title: settings.customDocumentTitle || data.invoiceTitle || "DOCUMENT",
    partyLabel: settings.customPartyLabel || data.customerLabel || "PARTY",
    showDueDate,
    showBuyerTrn,
    totalLabel: settings.customTotalLabel || "Total",
    showTax,
  };
}

export function buildDocumentTemplateData(
  businessId: string,
  userId: string,
  businessName: string,
  baseCurrency: string,
  documentType: string,
  documentId: string
): ExtractedDocumentData {
  let currency = baseCurrency;
  let title = "";
  let number = "";
  let partyLabel = "BILL TO";
  let partyName = "";
  let partyAddress: string | undefined = undefined;
  let partyTrn: string | undefined = undefined;
  let partyEmail: string | undefined = undefined;
  let partyPhone: string | undefined = undefined;
  let docNotes: string | undefined = undefined;
  let docTerms: string | undefined = undefined;
  let dateLabel = "";
  let dueLabel: string | undefined = undefined;
  let foreignDetail: string | undefined = undefined;
  let status: string | undefined = undefined;
  let subtotalMinor = 0;
  let taxMinor = 0;
  let totalMinor = 0;
  let rows: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    discount?: string;
    tax?: string;
    project?: string;
  }> = [];
  let customFields: { name: string; value: string }[] = [];

  if (documentType === "sales-invoice") {
    const record = getInvoice(businessId, userId, documentId);
    if (!record) throw new Error("Invoice not found");
    currency = record.invoice.currencyCode;
    title = "INVOICE";
    number = record.invoice.invoiceNumber;
    status = record.invoice.documentStatus;
    partyName = record.customer.name;
    partyAddress =
      record.customer.billingAddress ||
      [record.customer.addressLine1, record.customer.city, record.customer.countrySubdivision, record.customer.countryCode]
        .filter(Boolean)
        .join(", ") ||
      undefined;
    partyTrn = record.customer.trn || record.customer.taxReference || undefined;
    partyEmail = record.customer.email || undefined;
    partyPhone = record.customer.phone || undefined;
    docNotes = record.invoice.notes || undefined;
    docTerms = record.invoice.terms || undefined;
    dateLabel = formatDate(record.invoice.invoiceDate);
    dueLabel = `Due: ${formatDate(record.invoice.dueDate)}`;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.invoice.exchangeRateToBase} ${baseCurrency} (${record.invoice.exchangeRateSource}, ${record.invoice.exchangeRateDate}) • Base Total: ${formatMoney(record.invoice.baseTotalMinor, baseCurrency)} • Base VAT: ${formatMoney(record.invoice.baseTaxMinor, baseCurrency)}`;
    }
    subtotalMinor = record.invoice.subtotalMinor;
    taxMinor = record.invoice.taxMinor;
    totalMinor = record.invoice.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: line.taxCode ? `${line.taxCode.name}` : undefined,
      project: line.project?.name,
    }));
    customFields = getCustomFieldPairsForEntity(businessId, userId, "sales_invoice", record.invoice.id);
  } else if (documentType === "purchase-invoice") {
    const record = getPurchaseInvoice(businessId, userId, documentId);
    if (!record) throw new Error("Purchase invoice not found");
    currency = record.invoice.currencyCode;
    title = "PURCHASE INVOICE";
    number = record.invoice.internalNumber;
    status = (record.invoice as any).documentStatus;
    partyLabel = "SUPPLIER";
    partyName = record.supplier.name;
    partyAddress = record.supplier.address || undefined;
    partyTrn = record.supplier.trn || record.supplier.taxReference || undefined;
    partyEmail = record.supplier.email || undefined;
    partyPhone = record.supplier.phone || undefined;
    docNotes = (record.invoice as any).notes || undefined;
    docTerms = (record.invoice as any).terms || undefined;
    dateLabel = formatDate(record.invoice.invoiceDate);
    dueLabel = `Due: ${formatDate(record.invoice.dueDate)}${record.invoice.supplierInvoiceNumber ? ` (Ref: ${record.invoice.supplierInvoiceNumber})` : ""}`;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.invoice.exchangeRateToBase} ${baseCurrency} (${record.invoice.exchangeRateSource}, ${record.invoice.exchangeRateDate}) • Base Total: ${formatMoney(record.invoice.baseTotalMinor, baseCurrency)} • Base VAT: ${formatMoney(record.invoice.baseTaxMinor, baseCurrency)}`;
    }
    subtotalMinor = record.invoice.subtotalMinor;
    taxMinor = record.invoice.taxMinor;
    totalMinor = record.invoice.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: (line as any).taxCode ? `${(line as any).taxCode.name}` : undefined,
      project: (line as any).project?.name,
    }));
  } else if (documentType === "purchase-order") {
    const record = getPurchaseOrder(businessId, userId, documentId);
    if (!record) throw new Error("Purchase order not found");
    currency = record.order.currencyCode;
    title = "PURCHASE ORDER";
    number = record.order.orderNumber;
    status = (record.order as any).status;
    partyLabel = "SUPPLIER";
    partyName = record.supplier.name;
    partyAddress = record.supplier.address || undefined;
    partyTrn = record.supplier.trn || record.supplier.taxReference || undefined;
    partyEmail = record.supplier.email || undefined;
    partyPhone = record.supplier.phone || undefined;
    docNotes = (record.order as any).notes || undefined;
    docTerms = (record.order as any).terms || undefined;
    dateLabel = formatDate((record.order as any).date || (record.order as any).orderDate);
    dueLabel = (record.order as any).expectedDate
      ? `Expected Date: ${formatDate((record.order as any).expectedDate)}`
      : (record.order as any).deliveryDate
      ? `Delivery Date: ${formatDate((record.order as any).deliveryDate)}`
      : undefined;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.order.exchangeRateToBase} ${baseCurrency} • Base Total: ${formatMoney(record.order.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.order.subtotalMinor;
    taxMinor = record.order.taxMinor;
    totalMinor = record.order.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: line.taxCode ? `${line.taxCode.name}` : undefined,
    }));
  } else if (documentType === "sales-credit-note") {
    const record = getCreditNote(businessId, userId, documentId);
    if (!record) throw new Error("Credit note not found");
    currency = record.note.currencyCode;
    title = "SALES CREDIT NOTE";
    number = record.note.creditNoteNumber;
    status = (record.note as any).documentStatus;
    partyLabel = "CREDIT TO";
    partyName = record.customer.name;
    partyAddress =
      record.customer.billingAddress ||
      [record.customer.addressLine1, record.customer.city, record.customer.countrySubdivision, record.customer.countryCode]
        .filter(Boolean)
        .join(", ") ||
      undefined;
    partyTrn = record.customer.trn || record.customer.taxReference || undefined;
    partyEmail = record.customer.email || undefined;
    partyPhone = record.customer.phone || undefined;
    docNotes = (record.note as any).notes || undefined;
    docTerms = (record.note as any).terms || undefined;
    dateLabel = formatDate(record.note.date);
    dueLabel = `Invoice: ${record.invoice.invoiceNumber}`;
    if (currency !== baseCurrency) {
      foreignDetail = `Original Rate: 1 ${currency} = ${record.note.exchangeRateToBase} ${baseCurrency} (${record.note.exchangeRateSource}, ${record.note.exchangeRateDate}) • Base Carrying Reduction: ${formatMoney(record.note.baseTotalMinor, baseCurrency)} • Base VAT: ${formatMoney(record.note.baseTaxMinor, baseCurrency)}`;
    }
    subtotalMinor = record.note.subtotalMinor;
    taxMinor = record.note.taxMinor;
    totalMinor = record.note.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: line.taxCode ? `${line.taxCode.name}` : undefined,
      project: line.project?.name,
    }));
  } else if (documentType === "debit-note") {
    const record = getDebitNote(businessId, userId, documentId);
    if (!record) throw new Error("Debit note not found");
    currency = record.note.currencyCode;
    title = "DEBIT NOTE";
    number = record.note.debitNoteNumber;
    status = (record.note as any).documentStatus;
    partyLabel = "SUPPLIER";
    partyName = record.note.supplierName;
    partyAddress = (record.note as any).supplierAddress || undefined;
    partyTrn = (record.note as any).supplierTrn || undefined;
    partyEmail = (record.note as any).supplierEmail || undefined;
    partyPhone = (record.note as any).supplierPhone || undefined;
    docNotes = (record.note as any).notes || undefined;
    docTerms = (record.note as any).terms || undefined;
    dateLabel = formatDate(record.note.debitNoteDate);
    dueLabel = undefined;
    subtotalMinor = record.note.subtotalMinor;
    taxMinor = record.note.taxMinor;
    totalMinor = record.note.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description || "-",
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: (line as any).taxCode ? `${(line as any).taxCode.name}` : undefined,
    }));
  } else if (documentType === "sales-quote") {
    const record = getSalesQuote(businessId, userId, documentId);
    if (!record) throw new Error("Quote not found");
    currency = record.quote.currencyCode;
    title = "SALES QUOTE";
    number = record.quote.quoteNumber;
    status = (record.quote as any).documentStatus;
    partyName = record.customer.name;
    partyAddress =
      record.customer.billingAddress ||
      [record.customer.addressLine1, record.customer.city, record.customer.countrySubdivision, record.customer.countryCode]
        .filter(Boolean)
        .join(", ") ||
      undefined;
    partyTrn = record.customer.trn || record.customer.taxReference || undefined;
    partyEmail = record.customer.email || undefined;
    partyPhone = record.customer.phone || undefined;
    docNotes = (record.quote as any).notes || undefined;
    docTerms = (record.quote as any).terms || undefined;
    dateLabel = formatDate(record.quote.quoteDate);
    dueLabel = record.quote.expiryDate ? `Expiry Date: ${formatDate(record.quote.expiryDate)}` : undefined;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.quote.exchangeRateToBase} ${baseCurrency} • Base Total: ${formatMoney(record.quote.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.quote.subtotalMinor;
    taxMinor = record.quote.taxMinor;
    totalMinor = record.quote.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: line.taxCode ? `${line.taxCode.name}` : undefined,
      project: line.project?.name,
    }));
    customFields = getCustomFieldPairsForEntity(businessId, userId, "sales_quote", record.quote.id);
  } else if (documentType === "sales-order") {
    const record = getSalesOrder(businessId, userId, documentId);
    if (!record) throw new Error("Sales order not found");
    currency = record.order.currencyCode;
    title = "SALES ORDER";
    number = record.order.orderNumber;
    status = (record.order as any).documentStatus;
    partyName = record.customer.name;
    partyAddress =
      record.customer.billingAddress ||
      [record.customer.addressLine1, record.customer.city, record.customer.countrySubdivision, record.customer.countryCode]
        .filter(Boolean)
        .join(", ") ||
      undefined;
    partyTrn = record.customer.trn || record.customer.taxReference || undefined;
    partyEmail = record.customer.email || undefined;
    partyPhone = record.customer.phone || undefined;
    docNotes = (record.order as any).notes || undefined;
    docTerms = (record.order as any).terms || undefined;
    dateLabel = formatDate(record.order.orderDate);
    dueLabel = record.order.deliveryDate ? `Delivery Date: ${formatDate(record.order.deliveryDate)}` : undefined;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.order.exchangeRateToBase} ${baseCurrency} • Base Total: ${formatMoney(record.order.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.order.subtotalMinor;
    taxMinor = record.order.taxMinor;
    totalMinor = record.order.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: line.taxCode ? `${line.taxCode.name}` : undefined,
      project: line.project?.name,
    }));
    customFields = getCustomFieldPairsForEntity(businessId, userId, "sales_order", record.order.id);
  } else if (documentType === "purchase-quote") {
    const record = getPurchaseQuote(businessId, userId, documentId);
    if (!record) throw new Error("Purchase quote not found");
    currency = record.quote.currencyCode;
    title = "PURCHASE QUOTE";
    number = record.quote.quoteNumber;
    status = (record.quote as any).documentStatus;
    partyLabel = "SUPPLIER";
    partyName = record.supplier.name;
    partyAddress = record.supplier.address || undefined;
    partyTrn = record.supplier.trn || record.supplier.taxReference || undefined;
    partyEmail = record.supplier.email || undefined;
    partyPhone = record.supplier.phone || undefined;
    docNotes = (record.quote as any).notes || undefined;
    docTerms = (record.quote as any).terms || undefined;
    dateLabel = formatDate(record.quote.quoteDate);
    dueLabel = record.quote.expiryDate ? `Expiry Date: ${formatDate(record.quote.expiryDate)}` : undefined;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.quote.exchangeRateToBase} ${baseCurrency} • Base Total: ${formatMoney(record.quote.baseTotalMinor, baseCurrency)}`;
    }
    subtotalMinor = record.quote.subtotalMinor;
    taxMinor = record.quote.taxMinor;
    totalMinor = record.quote.totalMinor;
    rows = record.lines.map((line) => ({
      description: line.description,
      quantity: quantityMicrosToInput(line.quantityMicros),
      unitPrice: formatMoney(line.unitPriceMinor, currency),
      amount: formatMoney(line.grossAmountMinor, currency),
      discount:
        (line as any).discountType === "percentage"
          ? `${(line as any).discountValue}%`
          : (line as any).discountType === "fixed"
          ? formatMoney(Number((line as any).discountValue), currency)
          : undefined,
      tax: line.taxCode ? `${line.taxCode.name}` : undefined,
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
    docNotes = (record.receipt as any).notes || undefined;
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
    docNotes = (record.delivery as any).notes || undefined;
    taxMinor = 0;
    totalMinor = record.lines.reduce((sum, line) => sum + Number(line.value_minor), 0);
    subtotalMinor = totalMinor;
    rows = record.lines.map((line) => ({
      description: `${String(line.sku ?? "")} ${String(line.item_name)}`.trim(),
      quantity: quantityMicrosToInput(Number(line.quantity_micros)),
      unitPrice: formatUnitCostMicros(
        averageUnitCostMicros(Number(line.value_minor), Number(line.quantity_micros)),
        currency
      ),
      amount: formatMoney(Number(line.value_minor), currency),
    }));
  } else if (documentType === "sales-receipt" || documentType === "receipt") {
    const record = getReceipt(businessId, userId, documentId);
    if (!record) throw new Error("Receipt not found");
    currency = String(record.receipt.currency_code);
    title = "PAYMENT RECEIPT";
    number = String(record.receipt.receipt_number);
    status = String(record.receipt.document_status);
    partyLabel = "RECEIVED FROM";
    partyName = String(record.receipt.customer_name);
    dateLabel = formatDate(String(record.receipt.date));
    dueLabel = record.receipt.bank_account_name ? `Account: ${String(record.receipt.bank_account_name)}` : undefined;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.receipt.exchange_rate_to_base} ${baseCurrency} (${record.receipt.exchange_rate_source}, ${record.receipt.exchange_rate_date}) • Base Total: ${formatMoney(record.receipt.base_amount_minor, baseCurrency)}`;
      if (Number(record.receipt.realized_fx_amount_minor) !== 0) {
        foreignDetail += ` • Realized FX: ${formatMoney(record.receipt.realized_fx_amount_minor, baseCurrency)}`;
      }
    }
    docNotes = record.receipt.description ? String(record.receipt.description) : undefined;
    subtotalMinor = Number(record.receipt.amount_minor);
    taxMinor = 0;
    totalMinor = Number(record.receipt.amount_minor);

    if (record.allocations.length > 0) {
      rows = record.allocations.map((alloc) => ({
        description: `Settlement toward Invoice ${alloc.invoice_number}`,
        quantity: "1",
        unitPrice: formatMoney(Number(alloc.amount_minor), currency),
        amount: formatMoney(Number(alloc.amount_minor), currency),
      }));
      if (Number(record.receipt.unallocated_amount_minor) > 0) {
        rows.push({
          description: "Advance Retainer / Unallocated Credit Balance",
          quantity: "1",
          unitPrice: formatMoney(Number(record.receipt.unallocated_amount_minor), currency),
          amount: formatMoney(Number(record.receipt.unallocated_amount_minor), currency),
        });
      }
    } else {
      rows = [
        {
          description: record.receipt.description || "Customer Payment Received",
          quantity: "1",
          unitPrice: formatMoney(totalMinor, currency),
          amount: formatMoney(totalMinor, currency),
        },
      ];
    }
  } else if (
    documentType === "purchase-payment" ||
    documentType === "supplier-payment" ||
    documentType === "payment"
  ) {
    const record = getSupplierPayment(businessId, userId, documentId);
    if (!record) throw new Error("Supplier payment not found");
    currency = String(record.payment.currency_code);
    title = "PAYMENT VOUCHER";
    number = String(record.payment.payment_number);
    status = String(record.payment.document_status);
    partyLabel = "PAID TO";
    partyName = String(record.payment.supplier_name);
    dateLabel = formatDate(String(record.payment.date));
    dueLabel = record.payment.bank_account_name ? `Paid From: ${String(record.payment.bank_account_name)}` : undefined;
    if (currency !== baseCurrency) {
      foreignDetail = `Rate: 1 ${currency} = ${record.payment.exchange_rate_to_base} ${baseCurrency} (${record.payment.exchange_rate_source}, ${record.payment.exchange_rate_date}) • Base Total: ${formatMoney(record.payment.base_amount_minor, baseCurrency)}`;
      if (Number(record.payment.realized_fx_amount_minor) !== 0) {
        foreignDetail += ` • Realized FX: ${formatMoney(record.payment.realized_fx_amount_minor, baseCurrency)}`;
      }
    }
    docNotes = record.payment.description ? String(record.payment.description) : undefined;
    subtotalMinor = Number(record.payment.amount_minor);
    taxMinor = 0;
    totalMinor = Number(record.payment.amount_minor);

    if (record.allocations.length > 0) {
      rows = record.allocations.map((alloc) => ({
        description: `Settlement for Supplier Invoice ${alloc.internal_number}`,
        quantity: "1",
        unitPrice: formatMoney(Number(alloc.amount_minor), currency),
        amount: formatMoney(Number(alloc.amount_minor), currency),
      }));
      if (Number(record.payment.unallocated_amount_minor) > 0) {
        rows.push({
          description: "Unallocated Supplier Advance Deposit",
          quantity: "1",
          unitPrice: formatMoney(Number(record.payment.unallocated_amount_minor), currency),
          amount: formatMoney(Number(record.payment.unallocated_amount_minor), currency),
        });
      }
    } else {
      rows = [
        {
          description: record.payment.description || "Supplier Payment Remitted",
          quantity: "1",
          unitPrice: formatMoney(totalMinor, currency),
          amount: formatMoney(totalMinor, currency),
        },
      ];
    }
  } else {
    throw new Error(`Unsupported document type: ${documentType}`);
  }

  let resolvedCompanyName = businessName;
  let resolvedCompanyAddress: string | undefined = undefined;
  let resolvedSellerTrn: string | undefined = undefined;
  let resolvedLogoUrl: string | undefined = undefined;
  let resolvedCompanyEmail: string | undefined = undefined;
  let resolvedCompanyPhone: string | undefined = undefined;
  let resolvedCompanyWebsite: string | undefined = undefined;

  try {
    const profile = getBusinessProfile(businessId, userId);
    if (profile) {
      if (profile.tradingName || profile.legalName) {
        resolvedCompanyName = profile.tradingName || profile.legalName;
      }
      const addr = [
        profile.addressLine1,
        profile.addressLine2,
        profile.city,
        profile.stateOrEmirate,
        profile.country,
      ]
        .filter(Boolean)
        .join(", ");
      if (addr) resolvedCompanyAddress = addr;
      if (profile.taxId) resolvedSellerTrn = profile.taxId;
      if (profile.logoUrl) resolvedLogoUrl = profile.logoUrl;
      if (profile.email) resolvedCompanyEmail = profile.email;
      if (profile.phone) resolvedCompanyPhone = profile.phone;
      if (profile.website) resolvedCompanyWebsite = profile.website;
    }
  } catch {
    /* fallback to businessName */
  }

  const data: DocumentTemplateData = {
    companyName: resolvedCompanyName,
    companyAddress: resolvedCompanyAddress,
    companyEmail: resolvedCompanyEmail,
    companyPhone: resolvedCompanyPhone,
    companyWebsite: resolvedCompanyWebsite,
    sellerTrn: resolvedSellerTrn,
    logoUrl: resolvedLogoUrl,
    invoiceTitle: title,
    invoiceNumber: number,
    customerLabel: partyLabel,
    customerName: partyName,
    customerAddress: partyAddress,
    customerTrn: partyTrn,
    customerEmail: partyEmail,
    customerPhone: partyPhone,
    invoiceDate: dateLabel,
    dueDate: dueLabel,
    lines: rows,
    subtotal: formatMoney(subtotalMinor, currency),
    tax: formatMoney(taxMinor, currency),
    total: formatMoney(totalMinor, currency),
    notes: docNotes,
    terms: docTerms,
    foreignDetail,
    customFields: customFields.length ? customFields : undefined,
    status,
  };

  return {
    data,
    filename: `${number}.pdf`,
    number,
    currency,
    title,
    status,
    totalMinor,
  };
}

export function getDocumentViewData(
  businessId: string,
  userId: string,
  businessName: string,
  baseCurrency: string,
  documentType: string,
  documentId: string
): DocumentViewBundle {
  const extracted = buildDocumentTemplateData(
    businessId,
    userId,
    businessName,
    baseCurrency,
    documentType,
    documentId
  );

  const settings = getTemplateSettings(businessId, userId, documentType);
  const variant = resolveDocumentVariant(documentType, settings, extracted.data);
  const pdfUrl = `/api/businesses/${businessId}/documents/${documentType}/${documentId}/pdf`;

  return {
    ...extracted,
    settings,
    variant,
    documentType,
    documentId,
    pdfUrl,
  };
}
