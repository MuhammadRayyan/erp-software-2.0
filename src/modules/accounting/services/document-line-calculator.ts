import type { BaseStoredLine } from "@/modules/documents/document-types";

import { addMinor, calculateTax, multiplyMoneyByQuantity, parseQuantityToMicros, splitTaxInclusive, calculateDiscount } from "@/modules/accounting/calculations/money";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { randomUUID } from "node:crypto";

export type StoredLine = BaseStoredLine & {
  id: string;
  itemId?: string | null;
  description: string;
  quantityMicros: number;
  unitPriceMinor: number;
  discountType: "none" | "percentage" | "fixed";
  discountValue: string;
  salesAccountId: string;
  expenseAccountId: string;
  taxCodeId: string;
  projectId: string | null;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  lineIndex: number;
};

type Config = {
  accountTypeFilter: "income" | "expense";
  taxDirection: "sales" | "purchases";
  supportItems: boolean;
  accountFieldOnLine: "salesAccountId" | "expenseAccountId";
  amountsIncludeTax: boolean;
};

export function calculateLines(
  sqlite: any,
  lines: any[],
  minorUnit: number,
  config: Config
): StoredLine[] {
  const accounts = sqlite
    .prepare(`SELECT id FROM accounts WHERE type = ? AND is_active = 1`)
    .all(config.accountTypeFilter) as { id: string }[];
  const accountIds = new Set(accounts.map((account) => account.id));

  const taxCodeRows = sqlite
    .prepare("SELECT id, rate_basis_points, direction, vat_category FROM tax_codes WHERE is_active = 1")
    .all() as { id: string; rate_basis_points: number; direction: string; vat_category: string | null }[];
  const taxCodeById = new Map(taxCodeRows.map((taxCode) => [taxCode.id, taxCode]));

  const itemRows = config.supportItems
    ? (sqlite.prepare(`SELECT id, ${config.accountFieldOnLine === "salesAccountId" ? "sales_account_id" : "inventory_asset_account_id"} AS account_id FROM inventory_items WHERE is_active = 1`).all() as { id: string; account_id: string }[])
    : [];
  const itemById = new Map(itemRows.map((item) => [item.id, item]));

  return lines.map((line: any, position: number): StoredLine => {
    const item = config.supportItems && line.itemId ? itemById.get(line.itemId) : null;
    if (config.supportItems && line.itemId && !item) {
      throw new Error("Cannot save document because an inventory item is missing or inactive.");
    }
    const accountId = item?.account_id ?? line[config.accountFieldOnLine];
    if (!accountIds.has(accountId) && !(config.supportItems && item)) {
      throw new Error("Cannot save document because a line has no active account.");
    }
    const taxCode = taxCodeById.get(line.taxCodeId);
    if (!taxCode) throw new Error("Cannot save document because a line has no active tax code.");
    if (![config.taxDirection, "both"].includes(taxCode.direction)) {
      throw new Error(`The selected tax code cannot be used for ${config.taxDirection === "sales" ? "Sales" : "Purchases"}.`);
    }
    if (!taxCode.vat_category) throw new Error("The selected tax code needs a VAT category before posting.");

    const quantityMicros = parseQuantityToMicros(line.quantity);
    const unitPriceMinor = parseCurrencyAmountToMinor(line.unitPrice, minorUnit, "Unit price");
    
    // Calculate un-discounted line total based on price * qty
    const lineTotalMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    
    // Apply discount
    const discountMinor = calculateDiscount(lineTotalMinor, line.discountType || "none", line.discountValue || "0", minorUnit);
    const discountedTotalMinor = lineTotalMinor - discountMinor;

    let netAmountMinor = 0;
    let taxAmountMinor = 0;
    let grossAmountMinor = 0;

    if (config.amountsIncludeTax) {
      // The discounted total is the GROSS amount
      grossAmountMinor = discountedTotalMinor;
      if (taxCode.vat_category === "reverse_charge") {
        netAmountMinor = grossAmountMinor;
        taxAmountMinor = 0; // Reverse charge does not add to gross, but in inclusive, gross is net
      } else {
        const split = splitTaxInclusive(grossAmountMinor, taxCode.rate_basis_points);
        netAmountMinor = split.netMinor;
        taxAmountMinor = split.taxMinor;
      }
    } else {
      // The discounted total is the NET amount
      netAmountMinor = discountedTotalMinor;
      taxAmountMinor = calculateTax(netAmountMinor, taxCode.rate_basis_points);
      grossAmountMinor = taxCode.vat_category === "reverse_charge" ? netAmountMinor : addMinor([netAmountMinor, taxAmountMinor]);
    }

    return {
      id: randomUUID(),
      itemId: config.supportItems ? line.itemId || null : null,
      description: line.description,
      quantityMicros,
      unitPriceMinor,
      discountType: line.discountType || "none",
      discountValue: line.discountValue || "0",
      salesAccountId: accountId,
      expenseAccountId: accountId,
      taxCodeId: line.taxCodeId,
      projectId: line.projectId || null,
      netAmountMinor,
      taxAmountMinor,
      grossAmountMinor,
      lineIndex: position,
    };
  });
}

export function totalsForLines(lines: StoredLine[]) {
  const subtotalMinor = addMinor(lines.map((line) => line.netAmountMinor));
  const taxMinor = addMinor(lines.map((line) => line.taxAmountMinor));
  return {
    subtotalMinor,
    taxMinor,
    totalMinor: addMinor(lines.map((line) => line.grossAmountMinor)),
  };
}

