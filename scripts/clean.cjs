const fs = require("fs");
const path = require("path");
const invoiceFormPath = path.join(__dirname, "../src/modules/sales-invoices/invoice-form.tsx");
let content = fs.readFileSync(invoiceFormPath, "utf-8");
content = content.replace(/<\/section>section>/g, "</section>");
content = content.replace(/<div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">\s*<table[\s\S]*?<\/table>\s*<\/div>/g, (match) => match + "</div>");
// Wait, I just added `</div>` in `replace_file_content` above. I just need to remove `section>`
fs.writeFileSync(invoiceFormPath, content);
