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

import { getPurchaseOrder } from "./purchase-order-service";
import { savePurchaseInvoice } from "@/modules/purchase-invoices/purchase-invoice-service";

import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";

export async function convertPurchaseOrderToInvoiceAction(businessId: string, orderId: string) {
  const { user } = await requireModule(businessId, "purchases");
  try {
    const orderData = getPurchaseOrder(businessId, user.id, orderId);
    if (!orderData) return { error: "Order not found." };
    if (orderData.order.status !== "issued") {
      return { error: "Only issued orders can be converted." };
    }

    const input = {
      supplierId: orderData.order.supplierId,
      projectId: orderData.order.projectId || "",
      amountsIncludeTax: orderData.order.amountsIncludeTax,
      supplierInvoiceNumber: `INV-${orderData.order.orderNumber}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      taxDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0], 
      reference: orderData.order.orderNumber,
      purchaseOrderId: orderId,
      notes: orderData.order.notes || "",
      terms: orderData.order.terms || "",
      currencyCode: orderData.order.currencyCode,
      exchangeRateToBase: String(orderData.order.exchangeRateToBase),
      exchangeRateDate: orderData.order.exchangeRateDate || "",
      exchangeRateSource: (orderData.order.exchangeRateSource || "Manual") as "Base" | "Manual" | "CBUAE",
      lines: orderData.lines.map((l: any) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        discountType: l.discountType || "none",
        discountValue: l.discountValue || "0",
        unitPrice: (l.unitPriceMinor / 100).toFixed(2),
        expenseAccountId: l.expenseAccountId || "",
        taxCodeId: l.taxCodeId || "",
        projectId: l.projectId || "",
      })),
    };
    
    const invoiceId = savePurchaseInvoice(businessId, user.id, input, "draft");

    // Automated Status Trigger: Mark purchase order as closed
    if (orderData.order.status === "issued") {
      const { getBusinessDb } = await import("@/core/db/business");
      const { purchaseOrders } = await import("@/core/db/business-schema");
      const { eq } = await import("drizzle-orm");
      const context = getBusinessDb(businessId, user.id);
      context.db.update(purchaseOrders)
        .set({ status: "closed" })
        .where(eq(purchaseOrders.id, orderId))
        .run();
    }

    return { invoiceId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to convert purchase order." };
  }


}

export async function createPurchaseOrderRevisionAction(businessId: string, orderId: string) {
  const { user } = await requireModule(businessId, "purchases");
  try {
    const { createPurchaseOrderRevision } = await import("./purchase-order-service");
    const newOrderId = createPurchaseOrderRevision(businessId, user.id, orderId);
    revalidatePath(`/b/${businessId}/purchases/orders`);
    revalidatePath(`/b/${businessId}/purchases/orders/${orderId}`);
    return { orderId: newOrderId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create order revision." };
  }
}
