"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { purchaseOrderInputSchema } from "./purchase-order-input";
import { cancelPurchaseOrder, closePurchaseOrder, deletePurchaseOrder, savePurchaseOrder, type PurchaseOrderIntent } from "./purchase-order-service";

export type PurchaseOrderActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function savePurchaseOrderAction(businessId: string, orderId: string | null, input: unknown, intent: PurchaseOrderIntent): Promise<PurchaseOrderActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = purchaseOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the purchase order fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = savePurchaseOrder(businessId, user.id, parsed.data, intent, orderId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The purchase order could not be saved." }; }
  redirect(`/b/${businessId}/purchases/orders/${id}?notice=${intent === "issue" ? "Purchase order issued" : "Draft saved"}`);
}

async function runStatusAction(businessId: string, orderId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requireModule(businessId, "purchases");
  try {
    if (action === "close") closePurchaseOrder(businessId, user.id, orderId);
    else if (action === "cancel") cancelPurchaseOrder(businessId, user.id, orderId);
    else deletePurchaseOrder(businessId, user.id, orderId);
    revalidatePath(`/b/${businessId}/purchases/orders`);
    revalidatePath(`/b/${businessId}/purchases/orders/${orderId}`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "The purchase order could not be updated." }; }
}

export async function closePurchaseOrderAction(businessId: string, orderId: string) {
  return runStatusAction(businessId, orderId, "close");
}

export async function cancelPurchaseOrderAction(businessId: string, orderId: string) {
  return runStatusAction(businessId, orderId, "cancel");
}

export async function deletePurchaseOrderAction(businessId: string, orderId: string) {
  return runStatusAction(businessId, orderId, "delete");
}
