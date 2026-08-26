const fs = require("fs");
const path = require("path");

function patchService(filePath) {
  const absolutePath = path.join(__dirname, "../", filePath);
  let content = fs.readFileSync(absolutePath, "utf-8");

  content = content.replace(
    /accountFieldOnLine: "([a-zA-Z]+)"([ \n]*)}/g,
    "accountFieldOnLine: \"$1\", amountsIncludeTax: data.amountsIncludeTax$2}"
  );

  fs.writeFileSync(absolutePath, content);
  console.log(`Patched ${filePath}`);
}

patchService("src/modules/sales-invoices/invoice-service.ts");
patchService("src/modules/sales-credit-notes/credit-note-service.ts");
patchService("src/modules/purchase-orders/purchase-order-service.ts");
patchService("src/modules/purchase-invoices/purchase-invoice-service.ts");

