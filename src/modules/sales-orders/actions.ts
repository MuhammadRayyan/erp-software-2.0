"use server";

import { redirect } from "next/navigation";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { salesOrderInputSchema } from "./sales-order-input";
import { cancelSalesOrder, closeSalesOrder, createSalesOrderRevision, deleteSalesOrder, saveSalesOrder, getSalesOrder, issueSalesOrder, type SalesOrderIntent } from "./sales-order-service";
import { createInvoice } from "@/modules/sales-invoices/invoice-service";
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

export type SalesOrderActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

const ordersPath = (businessId: string) => `/b/${businessId}/sales/orders`;

export async function saveSalesOrderAction(businessId: string, orderId: string | null, input: unknown, intent: SalesOrderIntent): Promise<SalesOrderActionResult> {
  const { user } = await requireSavePermission(businessId, "sales", orderId, intent);
  const parsed = salesOrderInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the sales order fields and lines.", fieldErrors: formatZodFieldErrors(parsed.error) };
  let id: string;
  try { id = saveSalesOrder(businessId, user.id, parsed.data, intent, orderId ?? undefined); }
  catch (error) { return { error: actionErrorMessage(error, "The sales order could not be saved.") }; }
  revalidateDocumentPaths(ordersPath(businessId), orderId, id);
  redirect(`${ordersPath(businessId)}/${id}?notice=${intent === "issue" ? "Sales order issued" : "Draft saved"}`);
}

async function runStatusAction(businessId: string, orderId: string, action: "close" | "cancel" | "delete") {
  const { user } = await requirePermission(businessId, "sales", action === "close" ? "edit" : "delete");
  try {
    if (action === "close") closeSalesOrder(businessId, user.id, orderId);
    else if (action === "cancel") cancelSalesOrder(businessId, user.id, orderId);
    else deleteSalesOrder(businessId, user.id, orderId);
    revalidateDocumentPaths(ordersPath(businessId), orderId);
    return {};
  } catch (error) { return { error: actionErrorMessage(error, "The sales order could not be updated.") }; }
}

export async function issueSalesOrderAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "sales", "approve");
  try {
    issueSalesOrder(businessId, user.id, orderId);
    revalidateDocumentPaths(ordersPath(businessId), orderId);
    return {};
  } catch (error) {
    return { error: actionErrorMessage(error, "The sales order could not be activated.") };
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

const EMIRATES = ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"] as const;

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

    const { sqlite } = getBusinessDb(businessId, user.id);
    const { order } = orderData;
    const customer = sqlite.prepare("SELECT payment_terms_days, country_subdivision FROM customers WHERE id = ?").get(order.customerId) as { payment_terms_days: number; country_subdivision: string } | undefined;
    const taxSettings = sqlite.prepare("SELECT default_supply_emirate FROM business_tax_settings WHERE id = 'default'").get() as { default_supply_emirate: string } | undefined;

    const rawSub = customer?.country_subdivision?.toLowerCase().trim().replace(/[\s-]+/g, "_");
    const customerEmirate = EMIRATES.find((e) => e === rawSub || (rawSub && rawSub.includes(e)));
    const supplyEmirate = customerEmirate || (taxSettings?.default_supply_emirate as (typeof EMIRATES)[number] | undefined) || "dubai";

    const rawTerms = customer?.payment_terms_days;
    const daysToAdd = (rawTerms !== null && rawTerms !== undefined) ? Number(rawTerms) : 30;
    const dueDate = addDaysIso(getBusinessTodayIso(), daysToAdd);

    const invoiceId = createInvoice(businessId, user.id, {
      customerId: order.customerId,
      projectId: order.projectId || "",
      amountsIncludeTax: order.amountsIncludeTax,
      invoiceDate: getBusinessTodayIso(),
      taxDate: getBusinessTodayIso(),
      dueDate,
      supplyEmirate,
      reference: order.orderNumber,
      salesOrderId: orderId,
      notes: order.notes || "",
      terms: order.terms || "",
      ...exchangeRateToInput(order, "Manual"),
      lines: pricedLinesToInput(orderData.lines, order.currencyCode, "salesAccountId"),
    }, "draft");

    // Automated status trigger: the invoiced order is completed.
    sqlite.prepare("UPDATE sales_orders SET document_status = ? WHERE id = ?").run("completed", orderId);
    revalidateDocumentPaths(ordersPath(businessId), orderId);
    revalidateDocumentPaths(`/b/${businessId}/sales/invoices`, invoiceId);
    return { invoiceId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to convert order to invoice.") };
  }
}

export async function createSalesOrderRevisionAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
  try {
    const newOrderId = createSalesOrderRevision(businessId, user.id, orderId);
    revalidateDocumentPaths(ordersPath(businessId), orderId);
    return { orderId: newOrderId };
  } catch (error) {
    return { error: actionErrorMessage(error, "Failed to create order revision.") };
  }
}

export async function duplicateSalesOrderAction(businessId: string, orderId: string) {
  const { user } = await requirePermission(businessId, "sales", "create");
  let newOrderId: string;
  try {
    const orderData = getSalesOrder(businessId, user.id, orderId);
    if (!orderData) return { error: "Sales order not found." };
    const { order } = orderData;
    const minorUnit = documentCurrencyMinorUnit(getBusinessDb(businessId, user.id).sqlite, order.currencyCode);
    newOrderId = saveSalesOrder(businessId, user.id, {
      customerId: order.customerId,
      projectId: order.projectId || "",
      amountsIncludeTax: Boolean(order.amountsIncludeTax),
      date: getBusinessTodayIso(),
      expectedDate: "",
      reference: order.salesQuoteId ? "" : (order.reference || ""),
      salesQuoteId: "",
      notes: order.notes || "",
      terms: order.terms || "",
      ...exchangeRateToInput(order, "Base"),
      lines: pricedLinesToInput(orderData.lines, order.currencyCode, "salesAccountId", { minorUnit, customFields: true }),
    }, "draft");
  } catch (error) {
    return { error: actionErrorMessage(error, "The sales order could not be duplicated.") };
  }
  revalidateDocumentPaths(ordersPath(businessId), newOrderId);
  redirect(`${ordersPath(businessId)}/${newOrderId}?notice=Sales order duplicated as draft`);
}
