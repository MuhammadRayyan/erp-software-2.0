
import os
import re

filepath = "src/modules/sales-credit-notes/credit-note-form.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

new_preview = """import {
  calculateTax,
  multiplyMoneyByQuantity,
  parseQuantityToMicros,
  splitTaxInclusive,
  calculateDiscount,
} from "@/modules/accounting/calculations/money";

function previewLine(
  line: CreditNoteInput["lines"][number] | undefined,
  taxCodes: TaxOption[],
  minorUnit: number,
  amountsIncludeTax: boolean
) {
  try {
    if (!line) return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
    const unitPriceMinor = parseCurrencyAmountToMinor(
      String(line.unitPrice || "0"),
      minorUnit,
      "Unit price"
    );
    const quantityMicros = parseQuantityToMicros(String(line.quantity || "0"));
    const lineTotalMinor = multiplyMoneyByQuantity(
      unitPriceMinor,
      quantityMicros
    );
    const discountMinor = calculateDiscount(
      lineTotalMinor,
      line.discountType || "none",
      String(line.discountValue || "0"),
      minorUnit
    );
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
  } catch {
    return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
  }
}"""

content = re.sub(r"import \{\s*calculateTax,\s*multiplyMoneyByQuantity,\s*parseQuantityToMicros,\s*\} from \"@/modules/accounting/calculations/money\";", "", content)

# Replace the previewLine function using regex
content = re.sub(r"function previewLine\([\s\S]*?return \{ netMinor: 0, taxMinor: 0, grossMinor: 0 \};\s*\}\s*\}", new_preview, content)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("done")

