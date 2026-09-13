
import fs from "fs";
import path from "path";

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
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, "utf8");

  // 1. Update form spacing
  content = content.replace(/<form className="space-y-7 /g, `<form className="space-y-5 `);
  
  // 2. Wrap sections in form-section
  content = content.replace(/<section className="border-b border-border pb-7">/g, `<section className="form-section">`);
  // The line items section is usually just <section>
  content = content.replace(/<section>\s*(<div className="mb-3 flex)/g, `<section className="form-section">\n        $1`);

  // 3. Update table wrapper and table class
  content = content.replace(/<div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">/g, `<div className="overflow-x-auto pb-4 -mx-2 px-2">`);
  content = content.replace(/className={`data-table /g, `className={\`line-item-table `);
  content = content.replace(/className="data-table /g, `className="line-item-table `);

  // 4. Remove hover:bg-transparent! and py-2 from td
  content = content.replace(/className="hover:bg-transparent!"/g, ``);
  content = content.replace(/className="py-2"/g, `className="align-top"`);
  
  // 5. Move "Add line" to dashed button
  // We need to extract the onClick from the Add line button.
  // It looks like: <Button type="button" variant="secondary" size="sm" onClick={() => append({...})}><Plus className="size-4" /> Add line</Button>
  const addBtnMatch = content.match(/<Button[^>]*onClick=\{([^}]+)\}[^>]*><Plus[^>]*\/> Add line<\/Button>/);
  if (addBtnMatch) {
    const appendLogic = addBtnMatch[1];
    
    // Remove it from the header
    content = content.replace(/<Button[^>]*onClick=\{[^}]+\}[^>]*><Plus[^>]*\/> Add line<\/Button>/, "");
    
    // Insert dashed button after </table>
    const dashedBtn = `\n          <button type="button" className="dashed-add-button mt-2" onClick={${appendLogic}}>\n            <Plus className="size-4" /> Add line\n          </button>`;
    content = content.replace(/<\/table>\s*<\/div>/, `</table>\n          </div>${dashedBtn}`);
  }

  // Write back
  fs.writeFileSync(file, content);
  console.log("Refactored", file);
}

