"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { purchaseQuoteInputSchema } from "./purchase-quote-input";
import {
  cancelPurchaseQuote,
  closePurchaseQuote,
  deletePurchaseQuote,
  getPurchaseQuote,
  issuePurchaseQuote,
  savePurchaseQuote,
  type PurchaseQuoteIntent,
} from "./purchase-quote-service";
import { savePurchaseOrder } from "@/modules/purchase-orders/purchase-order-service";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getBusinessTodayIso, getCurrencyMinorUnit, minorToDecimalString } from "@/core/format";
import { getBusinessDb } from "@/core/db/business";
import { getCurrency } from "@/modules/currency/currency";

import { formatZodFieldErrors } from "@/lib/zod-errors";

export type PurchaseQuoteActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function savePurchaseQuoteAction(
  businessId: string,
  quoteId: string | null,
  input: unknown,
  intent: PurchaseQuoteIntent,
  afterSave: "view" | "new" = "view",
): Promise<PurchaseQuoteActionResult> {
  const { user } = await requireSavePermission(businessId, "purchases", quoteId, intent);
  const parsed = purchaseQuoteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the purchase quote fields and lines.", fieldErrors: formatZodFieldErrors(parsed.error) };
  }
  let id: string;
  try {
    id = savePurchaseQuote(businessId, user.id, parsed.data, intent, quoteId ?? undefined);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The purchase quote could not be saved." };
  }
  const notice = intent === "issue" ? "Purchase quote issued" : "Draft saved";
  revalidatePath(`/b/${businessId}/purchases/quotes`);
  if (quoteId) revalidatePath(`/b/${businessId}/purchases/quotes/${quoteId}`);
  revalidatePath(`/b/${businessId}/purchases/quotes/${id}`);
  if (!quoteId && afterSave === "new") {
    redirect(`/b/${businessId}/purchases/quotes/new?notice=${encodeURIComponent(notice)}&fresh=${Date.now()}`);
  }
  redirect(`/b/${businessId}/purchases/quotes/${id}?notice=${encodeURIComponent(notice)}`);
}

async function runStatusAction(businessId: string, quoteId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requirePermission(businessId, "purchases", action === "close" ? "edit" : "delete");
  try {
    if (action === "close") closePurchaseQuote(businessId, user.id, quoteId);
    else if (action === "cancel") cancelPurchaseQuote(businessId, user.id, quoteId);
    else deletePurchaseQuote(businessId, user.id, quoteId);
    revalidatePath(`/b/${businessId}/purchases/quotes`);
    revalidatePath(`/b/${businessId}/purchases/quotes/${quoteId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The purchase quote could not be updated." };
  }
}

export async function issuePurchaseQuoteAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "purchases", "approve");
  try {
    issuePurchaseQuote(businessId, user.id, quoteId);
    revalidatePath(`/b/${businessId}/purchases/quotes`);
    revalidatePath(`/b/${businessId}/purchases/quotes/${quoteId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The purchase quote could not be issued." };
  }
}

export async function closePurchaseQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "close");
}

export async function cancelPurchaseQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "cancel");
}

export async function deletePurchaseQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "delete");
}

export async function convertPurchaseQuoteToOrderAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  try {
    const quoteData = getPurchaseQuote(businessId, user.id, quoteId);
    if (!quoteData) return { error: "Purchase quote not found." };
    if (quoteData.quote.documentStatus !== "sent") {
      return { error: "Only sent quotes can be converted." };
    }
    if (quoteData.linkedOrders && quoteData.linkedOrders.length > 0) {
      return { error: "This purchase quote has already been converted to an order." };
    }

    const input = {
      supplierId: quoteData.quote.supplierId,
      projectId: quoteData.quote.projectId || "",
      amountsIncludeTax: quoteData.quote.amountsIncludeTax,
      date: getBusinessTodayIso(),
      expectedDate: "",
      reference: quoteData.quote.quoteNumber,
      purchaseQuoteId: quoteId,
      notes: quoteData.quote.notes || "",
      terms: quoteData.quote.terms || "",
      currencyCode: quoteData.quote.currencyCode,
      exchangeRateToBase: String(quoteData.quote.exchangeRateToBase),
      exchangeRateDate: quoteData.quote.exchangeRateDate || "",
      exchangeRateSource: (quoteData.quote.exchangeRateSource || "Manual") as any,
      lines: quoteData.lines.map((l: any) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        discountType: l.discountType || "none",
        discountValue: l.discountValue || "0",
        unitPrice: minorToDecimalString(l.unitPriceMinor, quoteData.quote.currencyCode),
        expenseAccountId: l.expenseAccountId || "",
        taxCodeId: l.taxCodeId || "",
        projectId: l.projectId || "",
      })),
    };

    // Create draft purchase order
    const orderId = savePurchaseOrder(businessId, user.id, input, "draft");

    // Automated Status Trigger: Mark quote as accepted
    const { getBusinessDb } = await import("@/core/db/business");
    const { purchaseQuotes } = await import("@/core/db/business-schema");
    const { eq } = await import("drizzle-orm");
    const context = getBusinessDb(businessId, user.id);
    context.db.update(purchaseQuotes)
      .set({ documentStatus: "accepted" })
      .where(eq(purchaseQuotes.id, quoteId))
      .run();

    revalidatePath(`/b/${businessId}/purchases/quotes`);
    revalidatePath(`/b/${businessId}/purchases/quotes/${quoteId}`);
    revalidatePath(`/b/${businessId}/purchases/orders`);
    revalidatePath(`/b/${businessId}/purchases/orders/${orderId}`);
    return { orderId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to convert purchase quote." };
  }
}

export async function createPurchaseQuoteRevisionAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  try {
    const { createPurchaseQuoteRevision } = await import("./purchase-quote-service");
    const newQuoteId = createPurchaseQuoteRevision(businessId, user.id, quoteId);
    revalidatePath(`/b/${businessId}/purchases/quotes`);
    revalidatePath(`/b/${businessId}/purchases/quotes/${quoteId}`);
    revalidatePath(`/b/${businessId}/purchases/quotes/${newQuoteId}`);
    return { quoteId: newQuoteId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create quote revision." };
  }
}

export async function duplicatePurchaseQuoteAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  let newQuoteId: string;
  try {
    const quoteData = getPurchaseQuote(businessId, user.id, quoteId);
    if (!quoteData) return { error: "Purchase quote not found." };
    const { sqlite } = getBusinessDb(businessId, user.id);
    let minorUnit = getCurrencyMinorUnit(quoteData.quote.currencyCode);
    try {
      minorUnit = getCurrency(sqlite, quoteData.quote.currencyCode, false).minor_unit;
    } catch {
      // fallback to knownMinorUnits
    }
    const today = getBusinessTodayIso();
    const input = {
      supplierId: quoteData.quote.supplierId,
      projectId: quoteData.quote.projectId || "",
      amountsIncludeTax: Boolean(quoteData.quote.amountsIncludeTax),
      date: today,
      expiryDate: "",
      reference: quoteData.quote.reference || "",
      notes: quoteData.quote.notes || "",
      terms: quoteData.quote.terms || "",
      currencyCode: quoteData.quote.currencyCode,
      exchangeRateToBase: String(quoteData.quote.exchangeRateToBase),
      exchangeRateDate: quoteData.quote.exchangeRateDate || "",
      exchangeRateSource: (quoteData.quote.exchangeRateSource as "Manual" | "CBUAE" | "Base") || "Base",
      lines: quoteData.lines.map((l: any) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        discountType: l.discountType || "none",
        discountValue: l.discountValue || "0",
        unitPrice: minorToDecimalString(l.unitPriceMinor, quoteData.quote.currencyCode, minorUnit),
        expenseAccountId: l.expenseAccountId || "",
        taxCodeId: l.taxCodeId || "",
        projectId: l.projectId || "",
        customFields: l.customFields ?? {},
      })),
    };
    newQuoteId = savePurchaseQuote(businessId, user.id, input, "draft");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The purchase quote could not be duplicated." };
  }
  revalidatePath(`/b/${businessId}/purchases/quotes`);
  revalidatePath(`/b/${businessId}/purchases/quotes/${newQuoteId}`);
  redirect(`/b/${businessId}/purchases/quotes/${newQuoteId}?notice=Purchase quote duplicated as draft`);
}
