const fs = require("fs");
const path = require("path");

function patchValidation(filePath) {
  const absolutePath = path.join(__dirname, "../", filePath);
  let content = fs.readFileSync(absolutePath, "utf-8");

  // add imports
  const importEnd = content.indexOf(`} from "@/core/validation/document-schemas";`);
  if (importEnd !== -1 && !content.includes("amountsIncludeTaxSchema")) {
    content = content.replace(
      `} from "@/core/validation/document-schemas";`,
      `, amountsIncludeTaxSchema, discountTypeSchema, discountValueSchema } from "@/core/validation/document-schemas";`
    );
  }

  // add amountsIncludeTax to form schemas
  if (content.includes("dueDate:") && !content.includes("amountsIncludeTax:")) {
    content = content.replace("dueDate:", "amountsIncludeTax: amountsIncludeTaxSchema,\n  dueDate:");
  }
  if (content.includes("invoiceDate:") && !content.includes("amountsIncludeTax:")) {
    content = content.replace("invoiceDate:", "amountsIncludeTax: amountsIncludeTaxSchema,\n  invoiceDate:");
  }
  if (content.includes("creditNoteDate:") && !content.includes("amountsIncludeTax:")) {
    content = content.replace("creditNoteDate:", "amountsIncludeTax: amountsIncludeTaxSchema,\n  creditNoteDate:");
  }
  if (content.includes("orderDate:") && !content.includes("amountsIncludeTax:")) {
    content = content.replace("orderDate:", "amountsIncludeTax: amountsIncludeTaxSchema,\n  orderDate:");
  }

  // add discount fields to line schemas
  if (content.includes("unitPrice:") && !content.includes("discountType:")) {
    content = content.replace("unitPrice:", "discountType: discountTypeSchema,\n  discountValue: discountValueSchema,\n  unitPrice:");
  }

  fs.writeFileSync(absolutePath, content);
  console.log(`Patched ${filePath}`);
}

function patchService(filePath) {
  const absolutePath = path.join(__dirname, "../", filePath);
  let content = fs.readFileSync(absolutePath, "utf-8");

  if (!content.includes("amountsIncludeTax: data.amountsIncludeTax")) {
    content = content.replace(
      /accountFieldOnLine: (["a-zA-Z]+) }\)/g,
      "accountFieldOnLine: $1, amountsIncludeTax: data.amountsIncludeTax })"
    );
  }

  fs.writeFileSync(absolutePath, content);
  console.log(`Patched ${filePath}`);
}

patchValidation("src/modules/sales-invoices/invoice-input.ts");
patchService("src/modules/sales-invoices/invoice-service.ts");
patchValidation("src/modules/sales-credit-notes/credit-note-input.ts");
patchService("src/modules/sales-credit-notes/credit-note-service.ts");
patchValidation("src/modules/purchase-orders/purchase-order-input.ts");
patchService("src/modules/purchase-orders/purchase-order-service.ts");
patchValidation("src/modules/purchase-invoices/purchase-invoice-input.ts");
patchService("src/modules/purchase-invoices/purchase-invoice-service.ts");

