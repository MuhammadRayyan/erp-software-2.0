const fs = require("fs");
const path = require("path");

function copyDir(src, dest, replacements) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    let destName = entry.name;
    for (const [find, replace] of replacements.nameReplacements) {
      destName = destName.replace(find, replace);
    }
    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
    } else {
      let content = fs.readFileSync(srcPath, "utf-8");
      for (const [find, replace] of replacements.contentReplacements) {
        content = content.replace(find, replace);
      }
      fs.writeFileSync(destPath, content);
    }
  }
}

const baseDir = path.join(__dirname, "../src/modules");

// 1. Sales Quotes
copyDir(path.join(baseDir, "sales-invoices"), path.join(baseDir, "sales-quotes"), {
  nameReplacements: [
    [/invoice/g, "quote"],
  ],
  contentReplacements: [
    [/salesInvoices/g, "salesQuotes"],
    [/salesInvoiceLines/g, "salesQuoteLines"],
    [/sales_invoice/g, "sales_quote"],
    [/sales_invoices/g, "sales_quotes"],
    [/Invoice/g, "Quote"],
    [/invoice/g, "quote"],
    [/INVOICE/g, "QUOTE"],
  ]
});

// 2. Sales Orders
copyDir(path.join(baseDir, "sales-invoices"), path.join(baseDir, "sales-orders"), {
  nameReplacements: [
    [/invoice/g, "order"],
  ],
  contentReplacements: [
    [/salesInvoices/g, "salesOrders"],
    [/salesInvoiceLines/g, "salesOrderLines"],
    [/sales_invoice/g, "sales_order"],
    [/sales_invoices/g, "sales_orders"],
    [/Invoice/g, "Order"],
    [/invoice/g, "order"],
    [/INVOICE/g, "ORDER"],
  ]
});

// 3. Debit Notes
copyDir(path.join(baseDir, "sales-invoices"), path.join(baseDir, "purchase-debit-notes"), {
  nameReplacements: [
    [/invoice/g, "debit-note"],
  ],
  contentReplacements: [
    [/salesInvoices/g, "debitNotes"],
    [/salesInvoiceLines/g, "debitNoteLines"],
    [/sales_invoice/g, "debit_note"],
    [/sales_invoices/g, "debit_notes"],
    [/Sales Invoice/g, "Debit Note"],
    [/Sales/g, "Purchase"],
    [/salesAccountId/g, "expenseAccountId"],
    [/Invoice/g, "DebitNote"],
    [/invoice/g, "debitNote"],
    [/INVOICE/g, "DEBIT_NOTE"],
  ]
});

console.log("Scaffolded modules!");

