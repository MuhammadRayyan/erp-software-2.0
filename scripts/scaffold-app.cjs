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

const baseDir = path.join(__dirname, "../src/app/b/[businessId]");

copyDir(path.join(baseDir, "sales/invoices"), path.join(baseDir, "sales/quotes"), {
  nameReplacements: [],
  contentReplacements: [
    [/sales-invoices/g, "sales-quotes"],
    [/invoices/g, "quotes"],
    [/invoiceId/g, "quoteId"],
    [/Invoice/g, "Quote"],
    [/invoice/g, "quote"],
    [/INVOICE/g, "QUOTE"],
  ]
});

copyDir(path.join(baseDir, "sales/invoices"), path.join(baseDir, "sales/orders"), {
  nameReplacements: [],
  contentReplacements: [
    [/sales-invoices/g, "sales-orders"],
    [/invoices/g, "orders"],
    [/invoiceId/g, "orderId"],
    [/Invoice/g, "Order"],
    [/invoice/g, "order"],
    [/INVOICE/g, "ORDER"],
  ]
});

copyDir(path.join(baseDir, "sales/invoices"), path.join(baseDir, "purchases/debit-notes"), {
  nameReplacements: [],
  contentReplacements: [
    [/sales-invoices/g, "purchase-debit-notes"],
    [/sales\/invoices/g, "purchases/debit-notes"],
    [/invoiceId/g, "debitNoteId"],
    [/Sales Invoice/g, "Debit Note"],
    [/Sales/g, "Purchase"],
    [/sales/g, "purchases"],
    [/Invoice/g, "DebitNote"],
    [/invoice/g, "debitNote"],
    [/INVOICE/g, "DEBIT_NOTE"],
  ]
});

console.log("Scaffolded app routes!");

