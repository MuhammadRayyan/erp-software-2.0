const fs = require("fs");
const path = require("path");

const invoiceFormPath = path.join(__dirname, "../src/modules/sales-invoices/invoice-form.tsx");
let content = fs.readFileSync(invoiceFormPath, "utf-8");

content = content.replace(
  /const amountsIncludeTax = useWatch\(\{ control: form\.control, name: "amountsIncludeTax" \}\);/,
  `const amountsIncludeTax = useWatch({ control: form.control, name: "amountsIncludeTax" }) ?? false;`
);

fs.writeFileSync(invoiceFormPath, content);

