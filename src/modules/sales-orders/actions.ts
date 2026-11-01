"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { salesOrderInputSchema } from "./sales-order-input";
import { cancelSalesOrder, closeSalesOrder, deleteSalesOrder, saveSalesOrder, getSalesOrder, issueSalesOrder, type SalesOrderIntent } from "./sales-order-service";
import { createInvoice } from "@/modules/sales-invoices/invoice-service";

import { formatZodFieldErrors } from "@/lib/zod-errors";

export type SalesOrderActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function saveSalesOrderAction(businessId: string, orderId: string | null, input: unknown, intent: SalesOrderIntent): Promise<SalesOrderActionResult> {
  const { user } = await requireSavePermission(businessId, "sales", orderId, intent);
  const parsed = salesOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the sales order fields and lines.", fieldErrors: formatZodFieldErrors(parsed.error) };
  let id: string;
  try { id = saveSalesOrder(businessId, user.id, parsed.data, intent, orderId ?? undefined); }
  catch (error) { return { error: error instanceof Error ? error.message : "The sales order could not be saved." }; }
  revalidatePath(`/b/${businessId}/sales/orders`);
  if (orderId) revalidatePath(`/b/${businessId}/sales/orders/${orderId}`);
  revalidatePath(`/b/${businessId}/sales/orders/${id}`);
  redirect(`/b/${businessId}/sales/orders/${id}?notice=${intent === "issue" ? "Sales order issued" : "Draft saved"}`);
}

async function runStatusAction(businessId: string, orderId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requirePermission(businessId, "sales", action === "close" ? "edit" : "delete");
  try {
    if (action === "close") closeSalesOrder(businessId, user.id, orderId);
    else if (action === "cancel") cancelSalesOrder(businessId, user.id, orderId);
    else deleteSalesOrder(businessId, user.id, orderId);
    revalidatePath(`/b/${businessId}/sales/orders`);
    revalidatePath(`/b/${businessId}/sales/orders/${orderId}`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "The sales order could not be updated." }; }
}

export async function issueSalesOrderAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "sales", "approve");
  try {
    issueSalesOrder(businessId, user.id, orderId);
    revalidatePath(`/b/${businessId}/sales/orders`);
    revalidatePath(`/b/${businessId}/sales/orders/${orderId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The sales order could not be activated." };
  }
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
import { minorToDecimalString } from "@/core/format";

export async function convertSalesOrderToInvoiceAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
  try {
    const orderData = getSalesOrder(businessId, user.id, orderId);
    if (!orderData) return { error: "Order not found." };
    if (orderData.order.documentStatus !== "active") {
      return { error: "Only active orders can be converted." };
    }
    if (orderData.relatedInvoices && orderData.relatedInvoices.length > 0) {
      return { error: "This sales order has already been converted to an invoice." };
    }

    const { getBusinessDb } = await import("@/core/db/business");
    const context = getBusinessDb(businessId, user.id);
    const customer = context.sqlite.prepare("SELECT payment_terms_days, country_subdivision FROM customers WHERE id = ?").get(orderData.order.customerId) as { payment_terms_days: number; country_subdivision: string } | undefined;
    const taxSettings = context.sqlite.prepare("SELECT default_supply_emirate FROM business_tax_settings WHERE id = 'default'").get() as { default_supply_emirate: string } | undefined;

    const emirates = ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"] as const;
    const rawSub = customer?.country_subdivision?.toLowerCase().trim().replace(/[\s-]+/g, "_");
    const customerEmirate = emirates.find((e) => e === rawSub || (rawSub && rawSub.includes(e)));
    const supplyEmirate = customerEmirate || (taxSettings?.default_supply_emirate as any) || "dubai";

    const rawTerms = customer?.payment_terms_days;
    const daysToAdd = (rawTerms !== null && rawTerms !== undefined) ? Number(rawTerms) : 30;
    const dueDate = new Date(Date.now() + daysToAdd * 86400000).toISOString().split("T")[0];

    const input = {
      customerId: orderData.order.customerId,
      projectId: orderData.order.projectId || "",
      amountsIncludeTax: orderData.order.amountsIncludeTax,
      invoiceDate: new Date().toISOString().split("T")[0],
      taxDate: new Date().toISOString().split("T")[0],
      dueDate,
      supplyEmirate,
      reference: orderData.order.orderNumber,
      salesOrderId: orderId,
      notes: orderData.order.notes || "",
      terms: orderData.order.terms || "",
      currencyCode: orderData.order.currencyCode,
      exchangeRateToBase: String(orderData.order.exchangeRateToBase),
      exchangeRateDate: orderData.order.exchangeRateDate || "",
      exchangeRateSource: orderData.order.exchangeRateSource as "Manual" | "CBUAE" | "Base" || "Manual",
      lines: orderData.lines.map((l: any) => ({
        itemId: l.itemId || "",
        description: l.description,
        quantity: quantityMicrosToInput(l.quantityMicros),
        discountType: l.discountType || "none",
        discountValue: l.discountValue || "0",
        unitPrice: minorToDecimalString(l.unitPriceMinor, orderData.order.currencyCode),
        salesAccountId: l.salesAccountId || "",
        taxCodeId: l.taxCodeId || "",
        projectId: l.projectId || "",
      })),
    };
    
    const invoiceId = createInvoice(businessId, user.id, input, "draft");

    // Automated Status Trigger: Mark order as completed
    if (orderData.order.documentStatus === "active") {
      const { salesOrders } = await import("@/core/db/business-schema");
      const { eq } = await import("drizzle-orm");
      context.db.update(salesOrders)
        .set({ documentStatus: "completed" })
        .where(eq(salesOrders.id, orderId))
        .run();
    }
    revalidatePath(`/b/${businessId}/sales/orders`);
    revalidatePath(`/b/${businessId}/sales/orders/${orderId}`);
    revalidatePath(`/b/${businessId}/sales/invoices`);
    revalidatePath(`/b/${businessId}/sales/invoices/${invoiceId}`);
    return { invoiceId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to convert order to invoice." };
  }


}

export async function createSalesOrderRevisionAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
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
