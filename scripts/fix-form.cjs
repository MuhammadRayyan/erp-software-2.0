const fs = require("fs");
const path = require("path");

const invoiceFormPath = path.join(__dirname, "../src/modules/sales-invoices/invoice-form.tsx");
let content = fs.readFileSync(invoiceFormPath, "utf-8");

content = content.replace(
  /<\/dl>\n      <\/section>/,
  `</dl></div>\n      </section>`
);

fs.writeFileSync(invoiceFormPath, content);
console.log("Fixed form");

