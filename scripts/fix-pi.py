
import os

filepath = "src/modules/purchase-invoices/purchase-invoice-form.tsx"
with open(filepath, "r") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from \"@/modules/accounting/calculations/money\";",
    "import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros, splitTaxInclusive, calculateDiscount } from \"@/modules/accounting/calculations/money\";"
)

# 2. previewLine
old_preview_line = """function previewLine(line: PurchaseInvoiceInput["lines"][number] | undefined, taxCodes: TaxOption[], minorUnit: number) {
  try {
    const unitPriceMinor = parseCurrencyAmountToMinor(String(line?.unitPrice || "0"), minorUnit, "Unit price");
    const quantityMicros = parseQuantityToMicros(String(line?.quantity || "0"));
    const netMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const code = taxCodes.find((tax) => tax.id === line?.taxCodeId);
    const taxMinor = calculateTax(netMinor, code?.rateBasisPoints ?? 0);
    return { netMinor, taxMinor, grossMinor: code?.vatCategory === "reverse_charge" ? netMinor : netMinor + taxMinor };
  } catch { return { netMinor: 0, taxMinor: 0, grossMinor: 0 }; }
}"""

new_preview_line = """function previewLine(line: PurchaseInvoiceInput["lines"][number] | undefined, taxCodes: TaxOption[], minorUnit: number, amountsIncludeTax: boolean) {
  try {
    if (!line) return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
    const unitPriceMinor = parseCurrencyAmountToMinor(String(line.unitPrice || "0"), minorUnit, "Unit price");
    const quantityMicros = parseQuantityToMicros(String(line.quantity || "0"));
    const lineTotalMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const discountMinor = calculateDiscount(lineTotalMinor, line.discountType || "none", String(line.discountValue || "0"), minorUnit);
    const discountedTotalMinor = lineTotalMinor - discountMinor;
    const code = taxCodes.find((tax) => tax.id === line.taxCodeId);
    const rate = code?.rateBasisPoints ?? 0;

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
    grossMinor = code?.vatCategory === "reverse_charge" ? netMinor : grossMinor;
    return { netMinor, taxMinor, grossMinor };
  } catch { return { netMinor: 0, taxMinor: 0, grossMinor: 0 }; }
}"""
content = content.replace(old_preview_line, new_preview_line)

# 3. Form wrapper max-w-4xl
content = content.replace("<form className=\"space-y-7 max-w-4xl\" noValidate>", "<form className=\"space-y-7 max-w-none\" noValidate>")

# 4. State hooks
old_hooks = """  const [serverError, setServerError] = useState(""); const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));"""

new_hooks = """  const [serverError, setServerError] = useState("");
  const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));
  const [showDiscounts, setShowDiscounts] = useState(() => initial.lines.some((line) => line.discountType !== "none"));
  const [showLineNumber, setShowLineNumber] = useState(true);
  const [showDescription, setShowDescription] = useState(true);
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");"""
content = content.replace(old_hooks, new_hooks)

# 5. previews mapping & amountsIncludeTax
old_previews = """  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2; const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit));"""
new_previews = """  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const amountsIncludeTax = useWatch({ control, name: "amountsIncludeTax" }) ?? false;
  const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit, amountsIncludeTax));"""
content = content.replace(old_previews, new_previews)

# 6. updateGlobalTax
old_select = """  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {"""
new_select = """  function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
  }

  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {"""
content = content.replace(old_select, new_select)

with open(filepath, "w") as f:
    f.write(content)
print("done pi python")

