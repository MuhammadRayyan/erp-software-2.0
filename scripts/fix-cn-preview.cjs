const fs = require('fs');
let c = fs.readFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', 'utf-8');

const newPreview = import {
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
};

c = c.replace(/import \{\s*calculateTax,\s*multiplyMoneyByQuantity,\s*parseQuantityToMicros,\s*\} from "@\/modules\/accounting\/calculations\/money";/, '');

const oldPreviewStart = c.indexOf('function previewLine(');
const oldPreviewEnd = c.indexOf('return { netMinor: 0, taxMinor: 0, grossMinor: 0 };\\n  }\\n}') + 56;
c = c.substring(0, oldPreviewStart) + newPreview + c.substring(oldPreviewEnd);

fs.writeFileSync('src/modules/sales-credit-notes/credit-note-form.tsx', c);
