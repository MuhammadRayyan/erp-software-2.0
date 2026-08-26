// @ts-nocheck
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { salesOrderInputSchema } from "./sales-order-input";
import { cancelSalesOrder, closeSalesOrder, deleteSalesOrder, saveSalesOrder, type SalesOrderIntent } from "./sales-order-service";

export type SalesOrderActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function saveSalesOrderAction(businessId: string, orderId: string | null, input: unknown, intent: SalesOrderIntent): Promise<SalesOrderActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = salesOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the purchase order fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveSalesOrder(businessId, user.id, parsed.data, intent, orderId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The purchase order could not be saved." }; }
  redirect(`/b/${businessId}/purchases/orders/${id}?notice=${intent === "issue" ? "Purchase order issued" : "Draft saved"}`);
}

async function runStatusAction(businessId: string, orderId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requireModule(businessId, "purchases");
  try {
    if (action === "close") closeSalesOrder(businessId, user.id, orderId);
    else if (action === "cancel") cancelSalesOrder(businessId, user.id, orderId);
    else deleteSalesOrder(businessId, user.id, orderId);
    revalidatePath(`/b/${businessId}/purchases/orders`);
    revalidatePath(`/b/${businessId}/purchases/orders/${orderId}`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "The purchase order could not be updated." }; }
}

export async function closeSalesOrderAction(businessId: string, orderId: string) {
  return runStatusAction(businessId, orderId, "close");
}

export async function cancelSalesOrderAction(businessId: string, orderId: string) {
  return runStatusAction(businessId, orderId, "cancel");
}

export async function deleteSalesOrderAction(businessId: string, orderId: string) {
  return runStatusAction(businessId, orderId, "delete");
}
