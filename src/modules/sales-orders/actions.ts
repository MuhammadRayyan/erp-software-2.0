// @ts-nocheck
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { salesOrderInputSchema } from "./sales-order-input";
import { cancelSalesOrder, closeSalesOrder, deleteSalesOrder, saveSalesOrder, getSalesOrder, type SalesOrderIntent } from "./sales-order-service";
import { createInvoice } from "@/modules/sales-invoices/invoice-service";

export type SalesOrderActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function saveSalesOrderAction(businessId: string, orderId: string | null, input: unknown, intent: SalesOrderIntent): Promise<SalesOrderActionResult> {
  const { user } = await requireModule(businessId, "sales");
  const parsed = salesOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the sales order fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let id: string;
  try { id = saveSalesOrder(businessId, user.id, parsed.data, intent, orderId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The sales order could not be saved." }; }
  redirect(`/b/${businessId}/sales/orders/${id}?notice=${intent === "issue" ? "Sales order issued" : "Draft saved"}`);
}

async function runStatusAction(businessId: string, orderId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requireModule(businessId, "sales");
  try {
    if (action === "close") closeSalesOrder(businessId, user.id, orderId);
    else if (action === "cancel") cancelSalesOrder(businessId, user.id, orderId);
    else deleteSalesOrder(businessId, user.id, orderId);
    revalidatePath(`/b/${businessId}/sales/orders`);
    revalidatePath(`/b/${businessId}/sales/orders/${orderId}`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "The sales order could not be updated." }; }
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

import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";

export async function convertSalesOrderToInvoiceAction(businessId: string, orderId: string) {
  const { user } = await requireModule(businessId, "sales");
  try {
    const orderData = getSalesOrder(businessId, user.id, orderId);
    if (!orderData) return { error: "Order not found." };
    if (orderData.order.documentStatus !== "active" && orderData.order.documentStatus !== "completed") {
      return { error: "Only active or completed orders can be converted." };
    }

    const input = {
      customerId: orderData.order.customerId,
      projectId: orderData.order.projectId || "",
      amountsIncludeTax: orderData.order.amountsIncludeTax,
      invoiceDate: new Date().toISOString().split("T")[0],
      taxDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0], // Default net 14
      supplyEmirate: "dubai", // Should probably pull from customer, but safe default
      reference: orderData.order.orderNumber,
      salesOrderId: orderId,
      notes: orderData.order.notes || "",
      terms: orderData.order.terms || "",
      currencyCode: orderData.order.currencyCode,
      exchangeRateToBase: String(orderData.order.exchangeRateToBase),
      exchangeRateDate: orderData.order.exchangeRateDate || "",
      exchangeRateSource: (orderData.order.exchangeRateSource || "Manual") as any,
      lines: orderData.lines.map((l: any) => ({
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
    
    const invoiceId = createInvoice(businessId, user.id, input, "draft");

    // Automated Status Trigger: Mark order as completed
    if (orderData.order.documentStatus === "active") {
      const { getBusinessDb } = await import("@/core/db/business");
      const { salesOrders } = await import("@/core/db/business-schema");
      const { eq } = await import("drizzle-orm");
      const context = getBusinessDb(businessId, user.id);
      context.db.update(salesOrders)
        .set({ documentStatus: "completed" })
        .where(eq(salesOrders.id, orderId))
        .run();
    }

    return { invoiceId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to convert order to invoice." };
  }


}

export async function createSalesOrderRevisionAction(businessId: string, orderId: string) {
  const { user } = await requireModule(businessId, "sales");
  try {
    const { createSalesOrderRevision } = await import("./sales-order-service");
    const newOrderId = createSalesOrderRevision(businessId, user.id, orderId);
    revalidatePath(`/b/${businessId}/sales/orders`);
    revalidatePath(`/b/${businessId}/sales/orders/${orderId}`);
    return { orderId: newOrderId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create order revision." };
  }
}
