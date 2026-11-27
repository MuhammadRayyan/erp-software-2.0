"use server";

import { redirect } from "next/navigation";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { purchaseQuoteInputSchema } from "./purchase-quote-input";
import {
  cancelPurchaseQuote,
  closePurchaseQuote,
  createPurchaseQuoteRevision,
  deletePurchaseQuote,
  getPurchaseQuote,
  issuePurchaseQuote,
  savePurchaseQuote,
  type PurchaseQuoteIntent,
} from "./purchase-quote-service";
import { savePurchaseOrder } from "@/modules/purchase-orders/purchase-order-service";
import { getBusinessTodayIso } from "@/core/format";
import { getBusinessDb } from "@/core/db/business";
import { formatZodFieldErrors } from "@/lib/zod-errors";
import {
  actionErrorMessage,
  documentCurrencyMinorUnit,
  exchangeRateToInput,
  pricedLinesToInput,
  revalidateDocumentPaths,
} from "@/modules/documents/engine/document-action-helpers";

export type PurchaseQuoteActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

const quotesPath = (businessId: string) => `/b/${businessId}/purchases/quotes`;

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
    return { error: actionErrorMessage(error, "The purchase quote could not be saved.") };
  }
  const notice = intent === "issue" ? "Purchase quote issued" : "Draft saved";
  revalidateDocumentPaths(quotesPath(businessId), quoteId, id);
  if (!quoteId && afterSave === "new") {
    redirect(`${quotesPath(businessId)}/new?notice=${encodeURIComponent(notice)}&fresh=${Date.now()}`);
  }
  redirect(`${quotesPath(businessId)}/${id}?notice=${encodeURIComponent(notice)}`);
}

async function runStatusAction(businessId: string, quoteId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requirePermission(businessId, "purchases", action === "close" ? "edit" : "delete");
  try {
    if (action === "close") closePurchaseQuote(businessId, user.id, quoteId);
    else if (action === "cancel") cancelPurchaseQuote(businessId, user.id, quoteId);
    else deletePurchaseQuote(businessId, user.id, quoteId);
    revalidateDocumentPaths(quotesPath(businessId), quoteId);
    return {};
  } catch (error) {
    return { error: actionErrorMessage(error, "The purchase quote could not be updated.") };
  }
}

export async function issuePurchaseQuoteAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "purchases", "approve");
  try {
    issuePurchaseQuote(businessId, user.id, quoteId);
    revalidateDocumentPaths(quotesPath(businessId), quoteId);
    return {};
  } catch (error) {
    return { error: actionErrorMessage(error, "The purchase quote could not be issued.") };
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

    const { quote } = quoteData;
    const orderId = savePurchaseOrder(businessId, user.id, {
      supplierId: quote.supplierId,
      projectId: quote.projectId || "",
      amountsIncludeTax: quote.amountsIncludeTax,
      date: getBusinessTodayIso(),
      expectedDate: "",
      reference: quote.quoteNumber,
      purchaseQuoteId: quoteId,
      notes: quote.notes || "",
      terms: quote.terms || "",
      ...exchangeRateToInput(quote, "Manual"),
      lines: pricedLinesToInput(quoteData.lines, quote.currencyCode, "expenseAccountId"),
    }, "draft");

    // Automated status trigger: the converted quote is accepted.
    getBusinessDb(businessId, user.id).sqlite.prepare("UPDATE purchase_quotes SET document_status = ? WHERE id = ?").run("accepted", quoteId);

    revalidateDocumentPaths(quotesPath(businessId), quoteId);
    revalidateDocumentPaths(`/b/${businessId}/purchases/orders`, orderId);
    return { orderId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to convert purchase quote.") };
  }
}

export async function createPurchaseQuoteRevisionAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  try {
    const newQuoteId = createPurchaseQuoteRevision(businessId, user.id, quoteId);
    revalidateDocumentPaths(quotesPath(businessId), quoteId, newQuoteId);
    return { quoteId: newQuoteId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to create quote revision.") };
  }
}

export async function duplicatePurchaseQuoteAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  let newQuoteId: string;
  try {
    const quoteData = getPurchaseQuote(businessId, user.id, quoteId);
    if (!quoteData) return { error: "Purchase quote not found." };
    const { quote } = quoteData;
    const minorUnit = documentCurrencyMinorUnit(getBusinessDb(businessId, user.id).sqlite, quote.currencyCode);
    newQuoteId = savePurchaseQuote(businessId, user.id, {
      supplierId: quote.supplierId,
      projectId: quote.projectId || "",
      amountsIncludeTax: Boolean(quote.amountsIncludeTax),
      date: getBusinessTodayIso(),
      expiryDate: "",
      reference: quote.reference || "",
      notes: quote.notes || "",
      terms: quote.terms || "",
      ...exchangeRateToInput(quote, "Base"),
      lines: pricedLinesToInput(quoteData.lines, quote.currencyCode, "expenseAccountId", { minorUnit, customFields: true }),
    }, "draft");
  } catch (error) {
    return { error: actionErrorMessage(error, "The purchase quote could not be duplicated.") };
  }
  revalidateDocumentPaths(quotesPath(businessId), newQuoteId);
  redirect(`${quotesPath(businessId)}/${newQuoteId}?notice=Purchase quote duplicated as draft`);
}
