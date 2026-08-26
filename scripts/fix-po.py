
import os

filepath = "src/modules/purchase-orders/purchase-order-form.tsx"
with open(filepath, "r") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros } from \"@/modules/accounting/calculations/money\";",
    "import { calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros, splitTaxInclusive, calculateDiscount } from \"@/modules/accounting/calculations/money\";"
)

# 2. previewLine
old_preview_line = """function previewLine(line: PurchaseOrderInput["lines"][number] | undefined, taxCodes: TaxOption[], minorUnit: number) {
  try {
    const unitPriceMinor = parseCurrencyAmountToMinor(String(line?.unitPrice || "0"), minorUnit, "Unit price");
    const quantityMicros = parseQuantityToMicros(String(line?.quantity || "0"));
    const netMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const rate = taxCodes.find((tax) => tax.id === line?.taxCodeId)?.rateBasisPoints ?? 0;
    const taxMinor = calculateTax(netMinor, rate);
    return { netMinor, taxMinor, grossMinor: netMinor + taxMinor };
  } catch { return { netMinor: 0, taxMinor: 0, grossMinor: 0 }; }
}"""

new_preview_line = """function previewLine(line: PurchaseOrderInput["lines"][number] | undefined, taxCodes: TaxOption[], minorUnit: number, amountsIncludeTax: boolean) {
  try {
    if (!line) return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
    const unitPriceMinor = parseCurrencyAmountToMinor(String(line.unitPrice || "0"), minorUnit, "Unit price");
    const quantityMicros = parseQuantityToMicros(String(line.quantity || "0"));
    const lineTotalMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const discountMinor = calculateDiscount(lineTotalMinor, line.discountType || "none", String(line.discountValue || "0"), minorUnit);
    const discountedTotalMinor = lineTotalMinor - discountMinor;
    const rate = taxCodes.find((tax) => tax.id === line.taxCodeId)?.rateBasisPoints ?? 0;

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
}"""
content = content.replace(old_preview_line, new_preview_line)

# 3. Form wrapper max-w-4xl
content = content.replace("<form className=\"space-y-7 max-w-4xl\" noValidate>", "<form className=\"space-y-7 max-w-none\" noValidate>")

# 4. State hooks
old_hooks = """  const [serverError, setServerError] = useState("");
  const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));"""

new_hooks = """  const [serverError, setServerError] = useState("");
  const [showLineProjects, setShowLineProjects] = useState(() => initial.lines.some((line) => Boolean(line.projectId)));
  const [showDiscounts, setShowDiscounts] = useState(() => initial.lines.some((line) => line.discountType !== "none"));
  const [showLineNumber, setShowLineNumber] = useState(true);
  const [showDescription, setShowDescription] = useState(true);
  const [globalTaxCodeId, setGlobalTaxCodeId] = useState(() => initial.lines[0]?.taxCodeId || taxCodes.find((taxCode) => taxCode.rateBasisPoints === 500)?.id || taxCodes[0]?.id || "");"""
content = content.replace(old_hooks, new_hooks)

# 5. previews mapping & amountsIncludeTax
old_previews = """  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit));"""
new_previews = """  const minorUnit = currencies.find((entry) => entry.code === currencyCode)?.minorUnit ?? 2;
  const amountsIncludeTax = useWatch({ control, name: "amountsIncludeTax" }) ?? false;
  const previews = lines.map((line) => previewLine(line, taxCodes, minorUnit, amountsIncludeTax));"""
content = content.replace(old_previews, new_previews)

# 6. updateGlobalTax
old_select = """  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) { const item = items.find((entry) => entry.id === itemId); if (!item) { form.setValue(`lines.${index}.expenseAccountId`, defaultExpense); return; } form.setValue(`lines.${index}.description`, item.name); form.setValue(`lines.${index}.unitPrice`, minorToCurrencyInput(item.purchasePriceMinor ?? 0, minorUnit)); form.setValue(`lines.${index}.expenseAccountId`, item.inventoryAssetAccountId); }"""
new_select = """  function updateGlobalTax(newTaxId: string) {
    setGlobalTaxCodeId(newTaxId);
    lines.forEach((_, i) => form.setValue(`lines.${i}.taxCodeId`, newTaxId));
  }

  const defaultExpense = expenseAccounts[0]?.id ?? "";
  function selectItem(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      form.setValue(`lines.${index}.expenseAccountId`, defaultExpense);
      return;
    }
    form.setValue(`lines.${index}.description`, item.name);
    if (item.purchasePriceMinor != null) {
      form.setValue(`lines.${index}.unitPrice`, formatMoney(item.purchasePriceMinor, currency, minorUnit).replace(/[^0-9.]/g, ""));
    }
    if (item.inventoryAssetAccountId) {
      form.setValue(`lines.${index}.expenseAccountId`, item.inventoryAssetAccountId);
    }
  }"""
content = content.replace(old_select, new_select)

# 7. Table fixes for variables inside the template to be injected
content = content.replace("defaultSalesAccountId", "defaultExpense")
content = content.replace("availableProjects", "projects")

with open(filepath, "w") as f:
    f.write(content)
print("done po python")

