"use server";

import { redirect } from "next/navigation";
import { requirePermission, requireSavePermission } from "@/core/permissions/require-module";
import { salesQuoteInputSchema } from "./quote-input";
import { cancelSalesQuote, closeSalesQuote, createSalesQuoteRevision, deleteSalesQuote, getSalesQuote, issueSalesQuote, saveSalesQuote, type SalesQuoteIntent } from "./quote-service";
import { saveSalesOrder } from "@/modules/sales-orders/sales-order-service";
import { getBusinessDb } from "@/core/db/business";
import { getBusinessTodayIso } from "@/core/format";
import { formatZodFieldErrors } from "@/lib/zod-errors";
import {
  actionErrorMessage,
  documentCurrencyMinorUnit,
  exchangeRateToInput,
  pricedLinesToInput,
  revalidateDocumentPaths,
} from "@/modules/documents/engine/document-action-helpers";

export type SalesQuoteActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

const quotesPath = (businessId: string) => `/b/${businessId}/sales/quotes`;

export async function saveSalesQuoteAction(
  businessId: string,
  quoteId: string | null,
  input: unknown,
  intent: SalesQuoteIntent,
  afterSave: "view" | "new" | "email" = "view",
): Promise<SalesQuoteActionResult> {
  const { user } = await requireSavePermission(businessId, "sales", quoteId, intent);
  const parsed = salesQuoteInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the sales quote fields and lines.", fieldErrors: formatZodFieldErrors(parsed.error) };
  let id: string;
  try { id = saveSalesQuote(businessId, user.id, parsed.data, intent, quoteId ?? undefined); }
  catch (error) { return { error: actionErrorMessage(error, "The sales quote could not be saved.") }; }
  const notice = intent === "issue" ? "Sales quote issued" : "Draft saved";
  revalidateDocumentPaths(quotesPath(businessId), quoteId, id);
  if (!quoteId && afterSave === "new") {
    redirect(`${quotesPath(businessId)}/new?notice=${encodeURIComponent(notice)}&fresh=${Date.now()}`);
  }
  if (afterSave === "email") {
    redirect(`${quotesPath(businessId)}/${id}?composeEmail=1&notice=${encodeURIComponent(notice)}`);
  }
  redirect(`${quotesPath(businessId)}/${id}?notice=${encodeURIComponent(notice)}`);
}

async function runStatusAction(businessId: string, quoteId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requirePermission(businessId, "sales", action === "close" ? "edit" : "delete");
  try {
    if (action === "close") closeSalesQuote(businessId, user.id, quoteId);
    else if (action === "cancel") cancelSalesQuote(businessId, user.id, quoteId);
    else deleteSalesQuote(businessId, user.id, quoteId);
    revalidateDocumentPaths(quotesPath(businessId), quoteId);
    return {};
  } catch (error) { return { error: actionErrorMessage(error, "The sales quote could not be updated.") }; }
}

export async function issueSalesQuoteAction(businessId: string, quoteId: string) {
  try {
    const { user } = await requirePermission(businessId, "sales", "approve");
    issueSalesQuote(businessId, user.id, quoteId);
    revalidateDocumentPaths(quotesPath(businessId), quoteId);
    return {};
  } catch (error) {
    return { error: actionErrorMessage(error, "The sales quote could not be issued.") };
  }
}

export async function closeSalesQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "close");
}

export async function cancelSalesQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "cancel");
}

export async function deleteSalesQuoteAction(businessId: string, quoteId: string) {
  try {
    await requirePermission(businessId, "sales", "delete");
    return runStatusAction(businessId, quoteId, "delete");
  } catch (error) {
    return { error: actionErrorMessage(error, "The sales quote could not be deleted.") };
  }
}

export async function convertSalesQuoteToOrderAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
  try {
    const quoteData = getSalesQuote(businessId, user.id, quoteId);
    if (!quoteData) return { error: "Quote not found." };
    if (quoteData.quote.documentStatus !== "sent") {
      return { error: "Only sent quotes can be converted." };
    }
    if (quoteData.linkedOrders && quoteData.linkedOrders.length > 0) {
      return { error: "This sales quote has already been converted to an order." };
    }

    const { quote } = quoteData;
    const orderId = saveSalesOrder(businessId, user.id, {
      customerId: quote.customerId,
      projectId: quote.projectId || "",
      amountsIncludeTax: quote.amountsIncludeTax,
      date: getBusinessTodayIso(),
      expectedDate: "",
      reference: quote.quoteNumber,
      salesQuoteId: quoteId,
      notes: quote.notes || "",
      terms: quote.terms || "",
      ...exchangeRateToInput(quote, "Manual"),
      lines: pricedLinesToInput(quoteData.lines, quote.currencyCode, "salesAccountId"),
    }, "draft");

    // Automated status trigger: the converted quote is accepted.
    getBusinessDb(businessId, user.id).sqlite.prepare("UPDATE sales_quotes SET document_status = ? WHERE id = ?").run("accepted", quoteId);

    revalidateDocumentPaths(quotesPath(businessId), quoteId);
    revalidateDocumentPaths(`/b/${businessId}/sales/orders`, orderId);
    return { orderId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to convert quote.") };
  }
}

export async function createSalesQuoteRevisionAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
  try {
    const newQuoteId = createSalesQuoteRevision(businessId, user.id, quoteId);
    revalidateDocumentPaths(quotesPath(businessId), quoteId, newQuoteId);
    return { quoteId: newQuoteId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to create quote revision.") };
  }
}

export async function duplicateSalesQuoteAction(businessId: string, quoteId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
  let newQuoteId: string;
  try {
    const quoteData = getSalesQuote(businessId, user.id, quoteId);
    if (!quoteData) return { error: "Sales quote not found." };
    const { quote } = quoteData;
    const minorUnit = documentCurrencyMinorUnit(getBusinessDb(businessId, user.id).sqlite, quote.currencyCode);
    newQuoteId = saveSalesQuote(businessId, user.id, {
      customerId: quote.customerId,
      projectId: quote.projectId || "",
      amountsIncludeTax: Boolean(quote.amountsIncludeTax),
      date: getBusinessTodayIso(),
      expectedDate: "",
      reference: quote.reference || "",
      notes: quote.notes || "",
      terms: quote.terms || "",
      ...exchangeRateToInput(quote, "Base"),
      lines: pricedLinesToInput(quoteData.lines, quote.currencyCode, "salesAccountId", { minorUnit, customFields: true }),
    }, "draft");
  } catch (error) {
    return { error: actionErrorMessage(error, "The sales quote could not be duplicated.") };
  }
  revalidateDocumentPaths(quotesPath(businessId), newQuoteId);
  redirect(`${quotesPath(businessId)}/${newQuoteId}?notice=Sales quote duplicated as draft`);
}
