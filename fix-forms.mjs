
import fs from "fs";

const files = [
  "src/modules/sales-invoices/invoice-form.tsx",
  "src/modules/debit-notes/debit-note-form.tsx",
  "src/modules/purchase-invoices/purchase-invoice-form.tsx",
  "src/modules/sales-quotes/quote-form.tsx",
  "src/modules/purchase-quotes/purchase-quote-form.tsx",
  "src/modules/sales-orders/sales-order-form.tsx",
  "src/modules/purchase-orders/purchase-order-form.tsx"
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  // Find the broken onClick and add )
  content = content.replace(/projectId:\s*""\s*}>/g, `projectId: "" })}>`);
  // also check if any forms don`t have projectId:
  content = content.replace(/salesAccountId:\s*defaultSalesAccountId,\s*taxCodeId:\s*defaultTaxCodeId\s*}>/g, `salesAccountId: defaultSalesAccountId, taxCodeId: defaultTaxCodeId })}>`);
  content = content.replace(/expenseAccountId:\s*defaultExpenseAccountId,\s*taxCodeId:\s*defaultTaxCodeId\s*}>/g, `expenseAccountId: defaultExpenseAccountId, taxCodeId: defaultTaxCodeId })}>`);
  fs.writeFileSync(file, content);
}

