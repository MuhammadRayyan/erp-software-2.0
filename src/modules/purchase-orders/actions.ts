"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { purchaseOrderInputSchema } from "./purchase-order-input";
import { cancelPurchaseOrder, closePurchaseOrder, createPurchaseOrderRevision, deletePurchaseOrder, getPurchaseOrder, issuePurchaseOrder, savePurchaseOrder, type PurchaseOrderIntent } from "./purchase-order-service";
import { savePurchaseInvoice } from "@/modules/purchase-invoices/purchase-invoice-service";
import { getBusinessDb } from "@/core/db/business";
import { getBusinessTodayIso } from "@/core/format";
import { formatZodFieldErrors } from "@/lib/zod-errors";
import { addDaysIso } from "@/modules/tax/uae-vat-config";
import {
  actionErrorMessage,
  documentCurrencyMinorUnit,
  exchangeRateToInput,
  pricedLinesToInput,
  revalidateDocumentPaths,
} from "@/modules/documents/engine/document-action-helpers";

export type PurchaseOrderActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

const ordersPath = (businessId: string) => `/b/${businessId}/purchases/orders`;

export async function savePurchaseOrderAction(businessId: string, orderId: string | null, input: unknown, intent: PurchaseOrderIntent): Promise<PurchaseOrderActionResult> {
  const { user } = await requireSavePermission(businessId, "purchases", orderId, intent);
  const parsed = purchaseOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the purchase order fields and lines.", fieldErrors: formatZodFieldErrors(parsed.error) };
  let id: string;
  try { id = savePurchaseOrder(businessId, user.id, parsed.data, intent, orderId ?? undefined); }
  catch (error) { return { error: actionErrorMessage(error, "The purchase order could not be saved.") }; }
  const saved = getPurchaseOrder(businessId, user.id, id);
  const status = saved?.order.status;
  const notice =
    status === "pending_approval"
      ? "Submitted for approval"
      : status === "issued"
        ? "Purchase order issued"
        : "Draft saved";
  revalidateDocumentPaths(ordersPath(businessId), orderId, id);
  revalidatePath(`/b/${businessId}/approvals`);
  revalidatePath(`/b/${businessId}/overview`);
  redirect(`${ordersPath(businessId)}/${id}?notice=${encodeURIComponent(notice)}`);
}

async function runStatusAction(businessId: string, orderId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requirePermission(businessId, "purchases", action === "close" ? "edit" : "delete");
  try {
    if (action === "close") closePurchaseOrder(businessId, user.id, orderId);
    else if (action === "cancel") cancelPurchaseOrder(businessId, user.id, orderId);
    else deletePurchaseOrder(businessId, user.id, orderId);
    revalidateDocumentPaths(ordersPath(businessId), orderId);
    return {};
  } catch (error) { return { error: actionErrorMessage(error, "The purchase order could not be updated.") }; }
}

export async function issuePurchaseOrderAction(
  businessId: string,
  orderId: string,
  intent: "issue" | "submit_approval" = "issue",
): Promise<{ error?: string; status?: "draft" | "pending_approval" | "issued" | "closed" | "cancelled" | "superseded" }> {
  const { user, access } = await requirePermission(businessId, "purchases", "edit");
  if (intent !== "submit_approval" && !access.requiresApproval) {
    await requirePermission(businessId, "purchases", "approve");
  }
  try {
    const status = issuePurchaseOrder(businessId, user.id, orderId, intent);
    revalidateDocumentPaths(ordersPath(businessId), orderId);
    revalidatePath(`/b/${businessId}/approvals`);
    revalidatePath(`/b/${businessId}/overview`);
    return { status };
  } catch (error) {
    return { error: actionErrorMessage(error, "The purchase order could not be issued.") };
  }
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

export async function convertPurchaseOrderToInvoiceAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  try {
    const orderData = getPurchaseOrder(businessId, user.id, orderId);
    if (!orderData) return { error: "Order not found." };
    if (orderData.order.status !== "issued") {
      return { error: "Only issued orders can be converted." };
    }
    if (orderData.relatedInvoices && orderData.relatedInvoices.length > 0) {
      return { error: "This purchase order has already been converted to an invoice." };
    }

    const { order } = orderData;
    const today = getBusinessTodayIso();
    const rawTerms = orderData.supplier?.paymentTermsDays;
    const daysToAdd = (rawTerms !== null && rawTerms !== undefined) ? Number(rawTerms) : 30;
    const dueDate = addDaysIso(getBusinessTodayIso(), daysToAdd);

    const invoiceId = savePurchaseInvoice(businessId, user.id, {
      supplierId: order.supplierId,
      projectId: order.projectId || "",
      amountsIncludeTax: order.amountsIncludeTax,
      supplierInvoiceNumber: `INV-${order.orderNumber}`,
      invoiceDate: today,
      taxDate: today,
      dueDate,
      reference: order.orderNumber,
      purchaseOrderId: orderId,
      notes: order.notes || "",
      terms: order.terms || "",
      ...exchangeRateToInput(order, "Manual"),
      lines: pricedLinesToInput(orderData.lines, order.currencyCode, "expenseAccountId"),
    }, "draft");

    // Automated status trigger: the invoiced purchase order is closed.
    getBusinessDb(businessId, user.id).sqlite.prepare("UPDATE purchase_orders SET status = ? WHERE id = ?").run("closed", orderId);

    revalidateDocumentPaths(ordersPath(businessId), orderId);
    revalidateDocumentPaths(`/b/${businessId}/purchases/invoices`, invoiceId);
    return { invoiceId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to convert purchase order.") };
  }
}

export async function createPurchaseOrderRevisionAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  try {
    const newOrderId = createPurchaseOrderRevision(businessId, user.id, orderId);
    revalidateDocumentPaths(ordersPath(businessId), orderId);
    return { orderId: newOrderId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to create order revision.") };
  }
}

export async function duplicatePurchaseOrderAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "purchases", "create");
  let newOrderId: string;
  try {
    const orderData = getPurchaseOrder(businessId, user.id, orderId);
    if (!orderData) return { error: "Purchase order not found." };
    const { order } = orderData;
    const minorUnit = documentCurrencyMinorUnit(getBusinessDb(businessId, user.id).sqlite, order.currencyCode);
    newOrderId = savePurchaseOrder(businessId, user.id, {
      supplierId: order.supplierId,
      projectId: order.projectId || "",
      amountsIncludeTax: Boolean(order.amountsIncludeTax),
      date: getBusinessTodayIso(),
      expectedDate: "",
      reference: order.purchaseQuoteId ? "" : (order.reference || ""),
      purchaseQuoteId: "",
      notes: order.notes || "",
      terms: order.terms || "",
      ...exchangeRateToInput(order, "Base"),
      lines: pricedLinesToInput(orderData.lines, order.currencyCode, "expenseAccountId", { minorUnit, customFields: true }),
    }, "draft");
  } catch (error) {
    return { error: actionErrorMessage(error, "The purchase order could not be duplicated.") };
  }
  revalidateDocumentPaths(ordersPath(businessId), newOrderId);
  redirect(`${ordersPath(businessId)}/${newOrderId}?notice=Purchase order duplicated as draft`);
}
