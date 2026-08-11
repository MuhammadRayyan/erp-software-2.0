"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { purchaseInvoiceInputSchema } from "./purchase-invoice-input";
import { deletePurchaseInvoice, duplicatePurchaseInvoice, savePurchaseInvoice, voidPurchaseInvoice, type PurchaseInvoiceIntent } from "./purchase-invoice-service";

export type PurchaseInvoiceActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function savePurchaseInvoiceAction(businessId: string, invoiceId: string | null, input: unknown, intent: PurchaseInvoiceIntent): Promise<PurchaseInvoiceActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = purchaseInvoiceInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the purchase invoice fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = savePurchaseInvoice(businessId, user.id, parsed.data, intent, invoiceId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The purchase invoice could not be saved." }; }
  redirect(`/b/${businessId}/purchases/invoices/${id}?notice=${intent === "post" ? "Purchase invoice posted" : "Draft saved"}`);
}

export async function duplicatePurchaseInvoiceAction(businessId: string, invoiceId: string) { const { user } = await requireModule(businessId, "purchases"); try { const id = duplicatePurchaseInvoice(businessId, user.id, invoiceId); redirect(`/b/${businessId}/purchases/invoices/${id}?notice=Purchase invoice duplicated as draft`); } catch (error) { return { error: error instanceof Error ? error.message : "The purchase invoice could not be duplicated." }; } }
export async function deletePurchaseInvoiceAction(businessId: string, invoiceId: string) { const { user } = await requireModule(businessId, "purchases"); try { deletePurchaseInvoice(businessId, user.id, invoiceId); revalidatePath(`/b/${businessId}/purchases/invoices`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "The purchase invoice could not be deleted." }; } }
export async function voidPurchaseInvoiceAction(businessId: string, invoiceId: string) { const { user } = await requireModule(businessId, "purchases"); try { voidPurchaseInvoice(businessId, user.id, invoiceId); revalidatePath(`/b/${businessId}/purchases/invoices/${invoiceId}`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "The purchase invoice could not be voided." }; } }
