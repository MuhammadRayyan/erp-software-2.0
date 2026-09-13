
import fs from "fs";

const file = "src/app/b/[businessId]/purchases/invoices/[invoiceId]/page.tsx";
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(/<article className="rounded-lg border border-border bg-surface-raised p-5 sm:p-7">/g, 
    `<article className="rounded-xl border border-border bg-surface-raised shadow-sm p-5 sm:p-7 dark:shadow-none">`);
  content = content.replace(/<div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2">/g, 
    `<div className="grid gap-6 border-b border-border pb-6 sm:grid-cols-2 -mx-5 -mt-5 bg-surface-muted/30 p-5 sm:-mx-7 sm:-mt-7 sm:p-7 rounded-t-xl">`);
  fs.writeFileSync(file, content);
  console.log("Refactored purchase invoice view");
}

