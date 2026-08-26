const fs = require("fs");
const path = require("path");

function fixFile(filePath) {
  const absolutePath = path.join(__dirname, "../", filePath);
  let content = fs.readFileSync(absolutePath, "utf-8");

  content = content.replace(/,\r?\n, amountsIncludeTaxSchema/g, ",\namountsIncludeTaxSchema");

  fs.writeFileSync(absolutePath, content);
  console.log(`Fixed ${filePath}`);
}

fixFile("src/modules/sales-invoices/invoice-input.ts");
fixFile("src/modules/sales-credit-notes/credit-note-input.ts");
fixFile("src/modules/purchase-orders/purchase-order-input.ts");
fixFile("src/modules/purchase-invoices/purchase-invoice-input.ts");

