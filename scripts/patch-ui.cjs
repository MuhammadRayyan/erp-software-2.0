const fs = require("fs");
const path = require("path");

const invoiceFormPath = path.join(__dirname, "../src/modules/sales-invoices/invoice-form.tsx");
let content = fs.readFileSync(invoiceFormPath, "utf-8");

// Add calculateDiscount, splitTaxInclusive imports
content = content.replace(
  /import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from "@\/modules\/accounting\/calculations\/money";/,
  `import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros, splitTaxInclusive, calculateDiscount } from "@/modules/accounting/calculations/money";`
);

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
content = content.replace(/function previewLine\(line: InvoiceInput\["lines"\]\[number\] \| undefined, taxCodes: TaxCodeOption\[\], minorUnit: number\) \{\s*try \{\s*const unitPriceMinor = parseCurrencyAmountToMinor\(String\(line\?\.unitPrice \|\| "0"\), minorUnit, "Unit price"\);\s*const quantityMicros = parseQuantityToMicros\(String\(line\?\.quantity \|\| "0"\)\);\s*const netMinor = multiplyMoneyByQuantity\(unitPriceMinor, quantityMicros\);\s*const rate = taxCodes\.find\(\(taxCode\) => taxCode\.id === line\?\.taxCodeId\)\?\.rateBasisPoints \?\? 0;\s*const taxMinor = calculateTax\(netMinor, rate\);\s*return \{ netMinor, taxMinor, grossMinor: netMinor \+ taxMinor \};\s*\} catch \{ return \{ netMinor: 0, taxMinor: 0, grossMinor: 0 \}; \}\s*\}/, previewLineReplacement);

// Add showDiscounts state
if (!content.includes("showDiscounts")) {
  content = content.replace(
    /const \[showLineProjects, setShowLineProjects\] = useState\(\(\) => initial\.lines\.some\(\(line\) => Boolean\(line\.projectId\)\)\);/,
    `const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));\n  const [showDiscounts, setShowDiscounts] = useState(() => initial.lines.some((line) => line.discountType !== "none"));`
  );
}

// Pass amountsIncludeTax to previews
content = content.replace(
  /const previews = lines.map\(\(line\) => previewLine\(line, taxCodes, minorUnit\)\);/,
  `const amountsIncludeTax = useWatch({ control: form.control, name: "amountsIncludeTax" });\n  const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit, amountsIncludeTax));`
);

// Add toggle button to line items header
if (!content.includes("Show Discount")) {
  content = content.replace(
    /\{showLineProjects \? "Hide line Projects" : "Show Project per line"\}<\/Button>/,
    `{showLineProjects ? "Hide line Projects" : "Show Project per line"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setShowDiscounts((value) => !value)} aria-pressed={showDiscounts}><Columns3 className="size-4" /> {showDiscounts ? "Hide Discount" : "Show Discount"}</Button>`
  );
}

// Update Add line defaults
if (!content.includes("discountType: \"none\", discountValue: \"0\"")) {
  content = content.replace(
    /append\(\{ itemId: "", description: "", quantity: "1", unitPrice: "0.00", salesAccountId: defaultSalesAccountId, taxCodeId: defaultTaxCodeId, projectId: "" \}\)/g,
    `append({ itemId: "", description: "", quantity: "1", unitPrice: "0.00", discountType: "none", discountValue: "0", salesAccountId: defaultSalesAccountId, taxCodeId: defaultTaxCodeId, projectId: "" })`
  );
}

// Add table header
if (!content.includes(">Discount<")) {
  content = content.replace(
    /<th className="w-48">Account<\/th>/,
    `{showDiscounts && <th className="w-44 text-right!">Discount</th>}<th className="w-48">Account</th>`
  );
  content = content.replace(
    /className={\`data-table \$\{showLineProjects \? "min-w-\[1480px\]" : "min-w-\[1270px\]"\}\`}/,
    `className={\`data-table \${showLineProjects ? "min-w-[1480px]" : "min-w-[1270px]"}\`}`
  );
}

// Add table cell for discount
if (!content.includes("discountType`}")) {
  const replacement = `{showDiscounts && <td className="py-2"><div className="flex gap-1 justify-end"><SelectNative aria-label={\`Line \${index + 1} discount type\`} className="w-[70px] px-2 py-1 h-9" {...register(\`lines.\${index}.discountType\`)}><option value="none">None</option><option value="percentage">%</option><option value="fixed">Fixed</option></SelectNative>{lines[index]?.discountType !== "none" && <Input aria-label={\`Line \${index + 1} discount value\`} className="money w-20 text-right px-2 py-1 h-9" type="number" step="any" min="0" {...register(\`lines.\${index}.discountValue\`)} />}</div></td>}<td className="py-2">{lines[index]?.itemId ?`;

  content = content.replace(
    /<td className="py-2">\{lines\[index\]\?\.itemId \?/g,
    replacement
  );
}

// Add tax inclusive checkbox below the totals
if (!content.includes("amountsIncludeTax`}")) {
  content = content.replace(
    /<div className="mt-5 flex items-start justify-between">[\s\S]*?<\/section>/,
    `<div className="mt-5 flex items-start justify-between"><div className="flex items-center gap-2 mt-2"><input type="checkbox" id="amountsIncludeTax" className="size-4 rounded-[4px] border-border-strong accent-primary" {...register("amountsIncludeTax")} /><Label htmlFor="amountsIncludeTax">Amounts are tax inclusive</Label></div>
          <dl className="ml-auto w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="money">{formatMoney(subtotalMinor, currencyCode, minorUnit)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">VAT</dt><dd className="money">{formatMoney(taxMinor, currencyCode, minorUnit)}</dd></div><div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="money">{formatMoney(subtotalMinor + taxMinor, currencyCode, minorUnit)}</dd></div>{baseEquivalentMinor != null && <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted-foreground">Base equivalent</dt><dd className="money">{formatMoney(baseEquivalentMinor, currency, baseMinorUnit)}</dd></div>}</dl>
        </div>
      </section>`
  );
}

fs.writeFileSync(invoiceFormPath, content);
console.log("Patched invoice UI");

