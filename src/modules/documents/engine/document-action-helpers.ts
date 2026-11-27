import type Database from "better-sqlite3";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrencyMinorUnit, minorToDecimalString } from "@/core/format";
import { requirePermission, requireSavePermission } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getCurrency } from "@/modules/currency/currency";
import type { InventoryDocumentIntent } from "@/modules/inventory/inventory-document";
import { inventoryErrorMessage } from "@/modules/inventory/inventory-error";

/**
 * Helpers shared by the server actions of the trade and stock documents
 * (quotes, orders, delivery notes, goods receipts): error results, path
 * revalidation, and turning a stored document back into form input for
 * duplicate / convert flows.
 */

export function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Revalidates a document list (`basePath`) and the detail pages of `ids`. */
export function revalidateDocumentPaths(basePath: string, ...ids: (string | null | undefined)[]) {
  revalidatePath(basePath);
  for (const id of ids) if (id) revalidatePath(`${basePath}/${id}`);
}

/** The currency's configured minor unit, falling back to the built-in table. */
export function documentCurrencyMinorUnit(sqlite: Database.Database, currencyCode: string) {
  try {
    return getCurrency(sqlite, currencyCode, false).minor_unit;
  } catch {
    return getCurrencyMinorUnit(currencyCode);
  }
}

type StoredPricedLine = {
  itemId: string | null;
  description: string;
  quantityMicros: number;
  discountType: string | null;
  discountValue: string | null;
  unitPriceMinor: number;
  taxCodeId: string | null;
  projectId: string | null;
  customFields?: Record<string, string>;
  salesAccountId?: string | null;
  expenseAccountId?: string | null;
};

/**
 * Stored priced lines → form input lines for another document.
 * `minorUnit` is passed when duplicating (configured currency precision);
 * `customFields` copies line custom field values (duplicates only).
 */
export function pricedLinesToInput<AccountField extends "salesAccountId" | "expenseAccountId">(
  lines: readonly StoredPricedLine[],
  currencyCode: string,
  accountField: AccountField,
  options: { minorUnit?: number; customFields?: boolean } = {},
) {
  return lines.map((line) => ({
    itemId: line.itemId || "",
    description: line.description,
    quantity: quantityMicrosToInput(line.quantityMicros),
    discountType: (line.discountType || "none") as "none" | "percentage" | "fixed",
    discountValue: line.discountValue || "0",
    unitPrice: minorToDecimalString(line.unitPriceMinor, currencyCode, options.minorUnit),
    [accountField]: line[accountField] || "",
    taxCodeId: line.taxCodeId || "",
    projectId: line.projectId || "",
    ...(options.customFields ? { customFields: line.customFields ?? {} } : {}),
  })) as ({
    itemId: string;
    description: string;
    quantity: string;
    discountType: "none" | "percentage" | "fixed";
    discountValue: string;
    unitPrice: string;
    taxCodeId: string;
    projectId: string;
    customFields?: Record<string, string>;
  } & Record<AccountField, string>)[];
}

/** Exchange-rate fields of a stored header as form input. */
export function exchangeRateToInput(
  header: { currencyCode: string; exchangeRateToBase: string | number; exchangeRateDate: string | null; exchangeRateSource: string | null },
  fallbackSource: "Manual" | "Base",
) {
  return {
    currencyCode: header.currencyCode,
    exchangeRateToBase: String(header.exchangeRateToBase),
    exchangeRateDate: header.exchangeRateDate || "",
    exchangeRateSource: (header.exchangeRateSource || fallbackSource) as "Manual" | "CBUAE" | "Base",
  };
}

type StockActionTarget<Schema extends z.ZodType> = {
  /** Title-case name used in messages, e.g. "Goods Receipt". */
  label: string;
  /** List path of the document, e.g. `/b/<id>/purchases/goods-receipts`. */
  basePath: string;
  schema: Schema;
};

/** Save action for a stock document (delivery note / goods receipt): validate, save, revalidate, redirect. */
export async function saveStockDocumentAction<Schema extends z.ZodType>(
  target: StockActionTarget<Schema>,
  businessId: string,
  documentId: string | null,
  input: unknown,
  intent: InventoryDocumentIntent,
  save: (userId: string, data: z.output<Schema>, documentId?: string) => string,
) {
  const { user } = await requireSavePermission(businessId, "inventory", documentId, intent);
  const parsed = target.schema.safeParse(input);
  if (!parsed.success) {
    return { error: `Check the ${target.label} fields and lines.`, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  let id: string;
  try {
    id = save(user.id, parsed.data, documentId ?? undefined);
  } catch (error) {
    return { error: inventoryErrorMessage(error, `The ${target.label} could not be saved.`) };
  }
  revalidateDocumentPaths(target.basePath, documentId, id);
  redirect(`${target.basePath}/${id}?notice=${intent === "post" ? `${target.label} posted` : "Draft saved"}`);
}

/** Void or delete action for a stock document; requires inventory delete. */
export async function stockDocumentCommandAction(
  target: { label: string; basePath: string },
  businessId: string,
  documentId: string,
  command: "void" | "delete",
  run: (userId: string) => void,
) {
  const { user } = await requirePermission(businessId, "inventory", "delete");
  try {
    run(user.id);
    if (command === "void") revalidateDocumentPaths(target.basePath, documentId);
    else revalidateDocumentPaths(target.basePath);
    return {};
  } catch (error) {
    return { error: inventoryErrorMessage(error, `The ${target.label} could not be ${command === "void" ? "voided" : "deleted"}.`) };
  }
}
