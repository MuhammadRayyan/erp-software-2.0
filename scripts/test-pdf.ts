import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderReactPdf } from '../src/modules/document-templates/react-pdf/render';
import { ClassicInvoiceDocument } from '../src/modules/document-templates/react-pdf/classic-invoice-template';
import { ClassicCreditNoteDocument } from '../src/modules/document-templates/react-pdf/classic-credit-note-template';
import { ClassicPurchaseOrderDocument } from '../src/modules/document-templates/react-pdf/classic-purchase-order-template';
import { ClassicReceiptDocument } from '../src/modules/document-templates/react-pdf/classic-receipt-template';
import { defaultSettings } from '../src/modules/document-templates/template-settings';
// Font registration is handled inside renderReactPdf via the shared registerFonts() helper.
// Fonts are loaded from public/fonts/pdf/ (local TTF files, no network required).

const dummyData = {
  companyName: "Acme Corp",
  invoiceNumber: "INV-001",
  invoiceDate: "Invoice date: 2026-08-16",
  dueDate: "Due date: 2026-09-16",
  customerName: "Globex Inc",
  customerAddress: "123 Main St, Anytown",
  customerTrn: "123456789",
  lines: [
    { description: "Widget", quantity: "10", unitPrice: "100.00", amount: "1000.00" },
    { description: "Service", quantity: "1", unitPrice: "500.00", amount: "500.00" }
  ],
  subtotal: "1500.00",
  tax: "75.00",
  total: "1575.00",
};

// Force Classic
const classicSettings = { ...defaultSettings, templateType: "classic" as const };

async function run() {
  console.log("Generating Classic PDFs...");
  const outDir = path.join(process.cwd(), "pdf-tests");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  // 1. Invoice
  const invoicePdf = await renderReactPdf(React.createElement(ClassicInvoiceDocument, { data: dummyData, settings: classicSettings }));
  fs.writeFileSync(path.join(outDir, "classic-invoice.pdf"), invoicePdf);
  console.log("classic-invoice.pdf generated", invoicePdf.length, "bytes");

  // 2. Credit Note
  const creditNoteData = { ...dummyData, invoiceNumber: "CN-001" };
  const creditNotePdf = await renderReactPdf(React.createElement(ClassicCreditNoteDocument, { data: creditNoteData, settings: classicSettings }));
  fs.writeFileSync(path.join(outDir, "classic-credit-note.pdf"), creditNotePdf);
  console.log("classic-credit-note.pdf generated", creditNotePdf.length, "bytes");

  // 3. Purchase Order
  const poData = { ...dummyData, invoiceNumber: "PO-001" };
  const poPdf = await renderReactPdf(React.createElement(ClassicPurchaseOrderDocument, { data: poData, settings: classicSettings }));
  fs.writeFileSync(path.join(outDir, "classic-purchase-order.pdf"), poPdf);
  console.log("classic-purchase-order.pdf generated", poPdf.length, "bytes");

  // 4. Receipt
  const receiptData = { ...dummyData, invoiceNumber: "REC-001" };
  const receiptPdf = await renderReactPdf(React.createElement(ClassicReceiptDocument, { data: receiptData, settings: classicSettings }));
  fs.writeFileSync(path.join(outDir, "classic-receipt.pdf"), receiptPdf);
  console.log("classic-receipt.pdf generated", receiptPdf.length, "bytes");

  console.log("Done!");
}

run().catch(console.error);
