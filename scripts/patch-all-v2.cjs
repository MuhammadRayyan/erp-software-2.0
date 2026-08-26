const fs = require("fs");
const path = require("path");

const invoiceFormPath = path.join(__dirname, "../src/modules/sales-invoices/invoice-form.tsx");
let content = fs.readFileSync(invoiceFormPath, "utf-8");

content = content.replace(/<form className="space-y-7 max-w-4xl" noValidate>/, `<form className="space-y-7" noValidate>`);

if (!content.includes("showLineNumber")) {
  content = content.replace(
    /const \[showLineProjects, setShowLineProjects\] = useState\(\(\) => initial\.lines\.some\(\(line\) => Boolean\(line\.projectId\)\)\);/,
    `const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));\n  const [showDiscounts, setShowDiscounts] = useState(() => initial.lines.some((line) => line.discountType !== "none"));\n  const [showLineNumber, setShowLineNumber] = useState(true);\n  const [showDescription, setShowDescription] = useState(true);\n  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");`
  );
}

if (!content.includes("updateGlobalTax")) {
  content = content.replace(
    /function selectItem/,
    `function updateGlobalTax(newTaxId: string) {\n    setGlobalTaxCodeId(newTaxId);\n    lines.forEach((_, i) => form.setValue(\`lines.\${i}.taxCodeId\`, newTaxId));\n  }\n\n  function selectItem`
  );
}

// Ensure calculateDiscount and splitTaxInclusive are imported
if (!content.includes("splitTaxInclusive")) {
  content = content.replace(
    /import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from "@\/modules\/accounting\/calculations\/money";/,
    `import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros, splitTaxInclusive, calculateDiscount } from "@/modules/accounting/calculations/money";`
  );
}

// Update previewLine
const previewLineReplacement = `function previewLine(line: InvoiceInput["lines"][number] | undefined, taxCodes: TaxCodeOption[], minorUnit: number, amountsIncludeTax: boolean) {
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
if (!content.includes("amountsIncludeTax: boolean")) {
  content = content.replace(/function previewLine\(line: InvoiceInput\["lines"\]\[number\] \| undefined, taxCodes: TaxCodeOption\[\], minorUnit: number\) \{\s*try \{\s*const unitPriceMinor = parseCurrencyAmountToMinor\(String\(line\?\.unitPrice \|\| "0"\), minorUnit, "Unit price"\);\s*const quantityMicros = parseQuantityToMicros\(String\(line\?\.quantity \|\| "0"\)\);\s*const netMinor = multiplyMoneyByQuantity\(unitPriceMinor, quantityMicros\);\s*const rate = taxCodes\.find\(\(taxCode\) => taxCode\.id === line\?\.taxCodeId\)\?\.rateBasisPoints \?\? 0;\s*const taxMinor = calculateTax\(netMinor, rate\);\s*return \{ netMinor, taxMinor, grossMinor: netMinor \+ taxMinor \};\s*\} catch \{ return \{ netMinor: 0, taxMinor: 0, grossMinor: 0 \}; \}\s*\}/, previewLineReplacement);
}

// Pass amountsIncludeTax to previews
if (!content.includes("const amountsIncludeTax =")) {
  content = content.replace(
    /const previews = lines.map\(\(line\) => previewLine\(line, taxCodes, minorUnit\)\);/,
    `const amountsIncludeTax = useWatch({ control: form.control, name: "amountsIncludeTax" }) ?? false;\n  const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit, amountsIncludeTax));`
  );
}

fs.writeFileSync(invoiceFormPath, content);
console.log("Patched V2!");

