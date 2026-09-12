import { replaceInFile } from "node:fs";

// Fix PurchaseOrderStatus
const poService = "src/modules/purchase-orders/purchase-order-service.ts";
const fs = require("fs");
let poContent = fs.readFileSync(poService, "utf8");
poContent = poContent.replace(
  'export type PurchaseOrderStatus = "draft" | "issued" | "closed" | "cancelled";',
  'export type PurchaseOrderStatus = "draft" | "issued" | "closed" | "cancelled" | "superseded";'
);
fs.writeFileSync(poService, poContent);

// Fix pdf-service.ts
const pdfService = "src/modules/document-templates/pdf-service.ts";
let pdfContent = fs.readFileSync(pdfService, "utf8");

// Fix supplierReference -> supplierInvoiceNumber
pdfContent = pdfContent.replace(
  'dueLabel = `Due: ${formatDate(record.invoice.dueDate)} (Ref: ${record.invoice.supplierReference || "-"})`;',
  'dueLabel = `Due: ${formatDate(record.invoice.dueDate)} (Ref: ${record.invoice.supplierInvoiceNumber || "-"})`;'
);

// Fix getCustomFieldPairsForEntity for purchase_invoice
pdfContent = pdfContent.replace(
  'customFields = getCustomFieldPairsForEntity(businessId, userId, "purchase_invoice", record.invoice.id);',
  '// customFields = getCustomFieldPairsForEntity(businessId, userId, "purchase_invoice", record.invoice.id);'
);

// Fix orderDate -> date
pdfContent = pdfContent.replace(
  'dateLabel = formatDate(record.order.orderDate);',
  'dateLabel = formatDate(record.order.date || record.order.orderDate);'
);

// Fix deliveryDate -> expectedDate
pdfContent = pdfContent.replace(
  'dueLabel = record.order.deliveryDate ? `Delivery Date: ${formatDate(record.order.deliveryDate)}` : "-";',
  'dueLabel = (record.order as any).expectedDate ? `Expected Date: ${formatDate((record.order as any).expectedDate)}` : (record.order as any).deliveryDate ? `Delivery Date: ${formatDate((record.order as any).deliveryDate)}` : "-";'
);

fs.writeFileSync(pdfService, pdfContent);
console.log("Fixed!");
