const fs = require("fs");
const path = require("path");

function patchForm(filePath, inputType, accountIdField, taxType) {
  let content = fs.readFileSync(filePath, "utf-8");

  // 1. Remove max-w-4xl
  content = content.replace(/<form className="space-y-7 max-w-4xl" noValidate>/, `<form className="space-y-7 max-w-none" noValidate>`);

  // 2. Add states
  if (!content.includes("showLineNumber")) {
    content = content.replace(
      /const \[showLineProjects, setShowLineProjects\] = useState\(\(\) => initial\.lines\.some\(\(line\) => Boolean\(line\.projectId\)\)\);/,
      `const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));\n  const [showDiscounts, setShowDiscounts] = useState(() => initial.lines.some((line) => line.discountType !== "none"));\n  const [showLineNumber, setShowLineNumber] = useState(true);\n  const [showDescription, setShowDescription] = useState(true);\n  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");`
    );
  }

  // 3. Add updateGlobalTax
  if (!content.includes("updateGlobalTax")) {
    content = content.replace(
      /function selectItem/,
      `function updateGlobalTax(newTaxId: string) {\n    setGlobalTaxCodeId(newTaxId);\n    lines.forEach((_, i) => form.setValue(\`lines.\${i}.taxCodeId\`, newTaxId));\n  }\n\n  function selectItem`
    );
  }

  // 4. Update previewLine
  const previewLineMatch = content.match(/function previewLine\(line: (.*?) \| undefined, taxCodes: (.*?)\[\], minorUnit: number\)/);
  if (previewLineMatch && !content.includes("amountsIncludeTax: boolean")) {
    const pInput = previewLineMatch[1];
    const pTax = previewLineMatch[2];
    const previewLineReplacement = `function previewLine(line: ${pInput} | undefined, taxCodes: ${pTax}[], minorUnit: number, amountsIncludeTax: boolean) {
  try {
    if (!line) return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
    const unitPriceMinor = parseCurrencyAmountToMinor(String(line.unitPrice || "0"), minorUnit, "Unit price");
    const quantityMicros = parseQuantityToMicros(String(line.quantity || "0"));
    const lineTotalMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const discountMinor = calculateDiscount(lineTotalMinor, line.discountType || "none", String(line.discountValue || "0"), minorUnit);
    const discountedTotalMinor = lineTotalMinor - discountMinor;
    const rate = taxCodes.find((taxCode) => taxCode.id === line.taxCodeId)?.rateBasisPoints ?? 0;

    let netMinor = 0;
    let taxMinor = 0;
    let grossMinor = 0;

    if (amountsIncludeTax) {
      grossMinor = discountedTotalMinor;
      const split = splitTaxInclusive(grossMinor, rate);
      netMinor = split.netMinor;
      taxMinor = split.taxMinor;
    } else {
      netMinor = discountedTotalMinor;
      taxMinor = calculateTax(netMinor, rate);
      grossMinor = netMinor + taxMinor;
    }
    return { netMinor, taxMinor, grossMinor };
  } catch { return { netMinor: 0, taxMinor: 0, grossMinor: 0 }; }
}`;
    content = content.replace(/function previewLine\(line:.*?\{ return \{ netMinor: 0, taxMinor: 0, grossMinor: 0 \}; \}\s*\}/s, previewLineReplacement);
  }

  // 5. Ensure calculateDiscount and splitTaxInclusive are imported
  if (!content.includes("splitTaxInclusive")) {
    content = content.replace(
      /import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from "@\/modules\/accounting\/calculations\/money";/,
      `import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros, splitTaxInclusive, calculateDiscount } from "@/modules/accounting/calculations/money";`
    );
  }

  // 6. Pass amountsIncludeTax to previews
  if (!content.includes("const amountsIncludeTax =")) {
    content = content.replace(
      /const previews = lines.map\(\(line\) => previewLine\(line, taxCodes, minorUnit\)\);/,
      `const amountsIncludeTax = useWatch({ control: form.control, name: "amountsIncludeTax" }) ?? false;\n    const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit, amountsIncludeTax));`
    );
  }

  // 7. Replace section
  const startStr = `<div className="mb-3 flex flex-wrap items-end justify-between gap-3">`;
  const start = content.indexOf(startStr);
  const endMatch = content.match(/<\/dl>[\s\n]*<\/section>/);
  
  if (start !== -1 && endMatch) {
    let accTypeStr = accountIdField === "expenseAccountId" ? "Expense" : "Sales";
    
    // We construct the new section dynamically to inject the right accountIdField
    let newSection = fs.readFileSync(path.join(__dirname, "../src/modules/sales-invoices/invoice-form.tsx"), "utf-8");
    const sourceStart = newSection.indexOf(startStr);
    const sourceEndMatch = newSection.match(/<\/dl>[\s\n]*<\/div>[\s\n]*<\/section>/);
    newSection = newSection.substring(sourceStart, sourceEndMatch.index + sourceEndMatch[0].length - 11); // up to </div>
    
    // In our source template (invoice), it uses salesAccountId.
    if (accountIdField === "expenseAccountId") {
      newSection = newSection.replace(/salesAccountId/g, "expenseAccountId");
      newSection = newSection.replace(/salesAccounts/g, "expenseAccounts");
      newSection = newSection.replace(/sales account/g, "expense account");
    }

    content = content.substring(0, start) + newSection + "\\n      </section>" + content.substring(endMatch.index + endMatch[0].length);
  }

  fs.writeFileSync(filePath, content);
  console.log("Patched", filePath);
}

patchForm(path.join(__dirname, "../src/modules/purchase-orders/purchase-order-form.tsx"), "PurchaseOrderInput", "expenseAccountId");
patchForm(path.join(__dirname, "../src/modules/purchase-invoices/purchase-invoice-form.tsx"), "PurchaseInvoiceInput", "expenseAccountId");
patchForm(path.join(__dirname, "../src/modules/sales-credit-notes/credit-note-form.tsx"), "CreditNoteInput", "salesAccountId");

