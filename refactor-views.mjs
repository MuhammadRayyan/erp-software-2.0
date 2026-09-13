
import fs from "fs";
import path from "path";

const files = [
  "src/app/b/[businessId]/sales/invoices/[invoiceId]/page.tsx",
  "src/app/b/[businessId]/purchases/debit-notes/[debitNoteId]/page.tsx",
  "src/app/b/[businessId]/sales/quotes/[quoteId]/page.tsx",
  "src/app/b/[businessId]/purchases/quotes/[quoteId]/page.tsx",
  "src/app/b/[businessId]/sales/orders/[orderId]/page.tsx",
  "src/app/b/[businessId]/purchases/orders/[orderId]/page.tsx",
  "src/app/b/[businessId]/sales/credit-notes/[creditNoteId]/page.tsx",
  "src/app/b/[businessId]/purchases/invoices/[purchaseInvoiceId]/page.tsx"
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, "utf8");
  
  // 1. Upgrade article shadow
  content = content.replace(/<article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">/g, 
    `<article className="rounded-xl border border-border bg-surface-raised shadow-sm p-5 sm:p-7 dark:shadow-none">`);
    
  // 2. Add subtle hero background to the first grid in article
  content = content.replace(/<div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2">/g, 
    `<div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2 -mx-5 -mt-5 bg-surface-muted\/30 p-5 sm:-mx-7 sm:-mt-7 sm:p-7 rounded-t-xl">`);

  fs.writeFileSync(file, content);
  console.log("Refactored view", file);
}

