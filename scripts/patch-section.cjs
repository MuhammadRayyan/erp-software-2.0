const fs = require("fs");
const path = require("path");

const invoiceFormPath = path.join(__dirname, "../src/modules/sales-invoices/invoice-form.tsx");
let content = fs.readFileSync(invoiceFormPath, "utf-8");

const startStr = `<div className="mb-3 flex flex-wrap items-end justify-between gap-3">`;

const start = content.indexOf(startStr);
const endMatch = content.match(/<\/dl>[\s\n]*<\/section>/);

if (start !== -1 && endMatch) {
  const replacement = fs.readFileSync(path.join(__dirname, "new-section.tsx"), "utf-8");
  content = content.substring(0, start) + replacement + "\n      </section>" + content.substring(endMatch.index + endMatch[0].length);
  fs.writeFileSync(invoiceFormPath, content);
  console.log("Successfully replaced section.");
} else {
  console.log("Could not find start/end.");
  console.log(start, endMatch);
}

