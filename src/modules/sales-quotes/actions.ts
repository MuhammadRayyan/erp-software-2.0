// @ts-nocheck
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { salesQuoteInputSchema } from "./quote-input";
import { cancelSalesQuote, closeSalesQuote, deleteSalesQuote, saveSalesQuote, type SalesQuoteIntent } from "./quote-service";

export type SalesQuoteActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function saveSalesQuoteAction(businessId: string, quoteId: string | null, input: unknown, intent: SalesQuoteIntent): Promise<SalesQuoteActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = salesQuoteInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the purchase quote fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveSalesQuote(businessId, user.id, parsed.data, intent, quoteId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The purchase quote could not be saved." }; }
  redirect(`/b/${businessId}/purchases/quotes/${id}?notice=${intent === "issue" ? "Purchase quote issued" : "Draft saved"}`);
}

async function runStatusAction(businessId: string, quoteId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requireModule(businessId, "purchases");
  try {
    if (action === "close") closeSalesQuote(businessId, user.id, quoteId);
    else if (action === "cancel") cancelSalesQuote(businessId, user.id, quoteId);
    else deleteSalesQuote(businessId, user.id, quoteId);
    revalidatePath(`/b/${businessId}/purchases/quotes`);
    revalidatePath(`/b/${businessId}/purchases/quotes/${quoteId}`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "The purchase quote could not be updated." }; }
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
