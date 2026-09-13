"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { salesQuoteInputSchema } from "./quote-input";
import { cancelSalesQuote, closeSalesQuote, deleteSalesQuote, getSalesQuote, saveSalesQuote, type SalesQuoteIntent } from "./quote-service";
import { saveSalesOrder } from "@/modules/sales-orders/sales-order-service";

export type SalesQuoteActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function saveSalesQuoteAction(businessId: string, quoteId: string | null, input: unknown, intent: SalesQuoteIntent): Promise<SalesQuoteActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = salesQuoteInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the sales quote fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveSalesQuote(businessId, user.id, parsed.data, intent, quoteId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The sales quote could not be saved." }; }
  redirect(`/b/${businessId}/sales/quotes/${id}?notice=${intent === "issue" ? "Sales quote issued" : "Draft saved"}`);
}

async function runStatusAction(businessId: string, quoteId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requireModule(businessId, "sales");
  try {
    if (action === "close") closeSalesQuote(businessId, user.id, quoteId);
    else if (action === "cancel") cancelSalesQuote(businessId, user.id, quoteId);
    else deleteSalesQuote(businessId, user.id, quoteId);
    revalidatePath(`/b/${businessId}/sales/quotes`);
    revalidatePath(`/b/${businessId}/sales/quotes/${quoteId}`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "The sales quote could not be updated." }; }
}

export async function closeSalesQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "close");
}

export async function cancelSalesQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "cancel");
}

export async function deleteSalesQuoteAction(businessId: string, quoteId: string) {
  return runStatusAction(businessId, quoteId, "delete");
}

import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";

export async function convertSalesQuoteToOrderAction(businessId: string, quoteId: string) {
  const { user } = await requireModule(businessId, "sales");
  try {
    const quoteData = getSalesQuote(businessId, user.id, quoteId);
    if (!quoteData) return { error: "Quote not found." };
    if (quoteData.quote.documentStatus !== "sent" && quoteData.quote.documentStatus !== "accepted") {
      return { error: "Only sent or accepted quotes can be converted." };
    }

    const input = {
      customerId: quoteData.quote.customerId,
      projectId: quoteData.quote.projectId || "",
      amountsIncludeTax: quoteData.quote.amountsIncludeTax,
      date: new Date().toISOString().split("T")[0],
      expectedDate: "",
      reference: quoteData.quote.quoteNumber,
      salesQuoteId: quoteId,
      notes: quoteData.quote.notes || "",
      terms: quoteData.quote.terms || "",
      currencyCode: quoteData.quote.currencyCode,
      exchangeRateToBase: String(quoteData.quote.exchangeRateToBase),
      exchangeRateDate: quoteData.quote.exchangeRateDate || "",
      exchangeRateSource: quoteData.quote.exchangeRateSource as "Manual" | "CBUAE" | "Base" || "Manual",
      lines: quoteData.lines.map((l: any) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        discountType: l.discountType || "none",
        discountValue: l.discountValue || "0",
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        salesAccountId: l.salesAccountId || "",
        taxCodeId: l.taxCodeId || "",
        projectId: l.projectId || "",
      })),
    };
    
    // Create draft order
    const orderId = saveSalesOrder(businessId, user.id, input, "draft");
    
    // Automated Status Trigger: Mark quote as accepted
    if (quoteData.quote.documentStatus === "sent") {
      const { getBusinessDb } = await import("@/core/db/business");
      const { salesQuotes } = await import("@/core/db/business-schema");
      const { eq } = await import("drizzle-orm");
      const context = getBusinessDb(businessId, user.id);
      context.db.update(salesQuotes)
        .set({ documentStatus: "accepted" })
        .where(eq(salesQuotes.id, quoteId))
        .run();
    }
    
    return { orderId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to convert quote." };
  }
}

export async function createSalesQuoteRevisionAction(businessId: string, quoteId: string) {
  const { user } = await requireModule(businessId, "sales");
  try {
    const { createSalesQuoteRevision } = await import("./quote-service");
    const newQuoteId = createSalesQuoteRevision(businessId, user.id, quoteId);
    revalidatePath(`/b/${businessId}/sales/quotes`);
    revalidatePath(`/b/${businessId}/sales/quotes/${quoteId}`);
    return { quoteId: newQuoteId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create quote revision." };
  }
}
