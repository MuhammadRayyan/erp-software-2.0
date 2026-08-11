"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import {
  archiveInboundEInvoice,
  createPurchaseInvoiceDraftFromInbound,
  createSupplierFromInbound,
  receiveInboundDocument,
  rejectInboundEInvoice,
  resolveLikelyDuplicate,
  selectInboundSupplier,
  updateInboundDocumentMatch,
  updateInboundLineMapping,
} from "./inbound-service";
import { buildMockInboundEnvelope } from "./mock-fixtures";
import { mockInboundScenarios } from "./mock-scenarios";

export type InboundEInvoiceActionResult = {
  error?: string;
  documentId?: string;
  status?: string;
  duplicateReceived?: boolean;
};

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function refresh(businessId: string, documentId?: string) {
  revalidatePath(`/b/${businessId}/purchases/einvoices`);
  if (documentId) revalidatePath(`/b/${businessId}/purchases/einvoices/${documentId}`);
}

export async function injectMockInboundAction(
  businessId: string,
  scenario: string,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "purchases");
    const selected = z.enum(mockInboundScenarios).parse(scenario);
    const document = receiveInboundDocument(
      businessId,
      user.id,
      buildMockInboundEnvelope(businessId, user.id, selected),
    );
    refresh(businessId, document.id);
    return {
      documentId: document.id,
      status: document.status,
      duplicateReceived: document.duplicateReceived,
    };
  } catch (error) {
    return { error: message(error, "The Mock inbound document could not be received.") };
  }
}

export async function selectInboundSupplierAction(
  businessId: string,
  documentId: string,
  supplierId: string,
  saveIdentityMapping = true,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "purchases");
    const document = selectInboundSupplier(businessId, user.id, documentId, supplierId, saveIdentityMapping);
    refresh(businessId, documentId);
    return { documentId, status: document.status };
  } catch (error) {
    return { error: message(error, "The Supplier could not be confirmed.") };
  }
}

export async function createSupplierFromInboundAction(
  businessId: string,
  documentId: string,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "purchases");
    const document = createSupplierFromInbound(businessId, user.id, documentId);
    refresh(businessId, documentId);
    revalidatePath(`/b/${businessId}/suppliers`);
    return { documentId, status: document.status };
  } catch (error) {
    return { error: message(error, "The Supplier could not be created.") };
  }
}

export async function updateInboundDocumentMatchAction(
  businessId: string,
  documentId: string,
  purchaseOrderId: string,
  goodsReceiptId: string,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "purchases");
    const document = updateInboundDocumentMatch(
      businessId,
      user.id,
      documentId,
      purchaseOrderId || null,
      goodsReceiptId || null,
    );
    refresh(businessId, documentId);
    return { documentId, status: document.status };
  } catch (error) {
    return { error: message(error, "The procurement match could not be updated.") };
  }
}

export async function updateInboundLineMappingAction(
  businessId: string,
  documentId: string,
  input: unknown,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "purchases");
    const parsed = z.object({
      lineId: z.string().uuid(),
      purchaseOrderLineId: z.string().optional().default(""),
      itemId: z.string().optional().default(""),
      expenseAccountId: z.string().optional().default(""),
      taxCodeId: z.string().min(1),
      projectId: z.string().optional().default(""),
      saveSupplierItemMapping: z.boolean().optional().default(false),
    }).parse(input);
    const document = updateInboundLineMapping(businessId, user.id, documentId, {
      lineId: parsed.lineId,
      purchaseOrderLineId: parsed.purchaseOrderLineId || null,
      itemId: parsed.itemId || null,
      expenseAccountId: parsed.expenseAccountId || null,
      taxCodeId: parsed.taxCodeId,
      projectId: parsed.projectId || null,
      saveSupplierItemMapping: parsed.saveSupplierItemMapping,
    });
    refresh(businessId, documentId);
    return { documentId, status: document.status };
  } catch (error) {
    return { error: message(error, "The line mapping could not be saved.") };
  }
}

export async function resolveLikelyDuplicateAction(
  businessId: string,
  documentId: string,
  reason: string,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user } = await requireModule(businessId, "purchases");
    const document = resolveLikelyDuplicate(businessId, user.id, documentId, reason);
    refresh(businessId, documentId);
    return { documentId, status: document.status };
  } catch (error) {
    return { error: message(error, "The duplicate review could not be saved.") };
  }
}

export async function rejectInboundEInvoiceAction(
  businessId: string,
  documentId: string,
  reason: string,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user, access } = await requireModule(businessId, "purchases");
    if (access.membership.role !== "administrator") throw new Error("Only a business Administrator can reject inbound eInvoices.");
    rejectInboundEInvoice(businessId, user.id, documentId, reason);
    refresh(businessId, documentId);
    return { documentId, status: "Rejected" };
  } catch (error) {
    return { error: message(error, "The inbound eInvoice could not be rejected.") };
  }
}

export async function archiveInboundEInvoiceAction(
  businessId: string,
  documentId: string,
  reason: string,
): Promise<InboundEInvoiceActionResult> {
  try {
    const { user, access } = await requireModule(businessId, "purchases");
    if (access.membership.role !== "administrator") throw new Error("Only a business Administrator can archive inbound eInvoices.");
    archiveInboundEInvoice(businessId, user.id, documentId, reason);
    refresh(businessId, documentId);
    return { documentId, status: "Archived" };
  } catch (error) {
    return { error: message(error, "The inbound eInvoice could not be archived.") };
  }
}

export async function createPurchaseInvoiceDraftFromInboundAction(
  businessId: string,
  documentId: string,
) {
  const { user } = await requireModule(businessId, "purchases");
  let invoiceId: string;
  try {
    invoiceId = createPurchaseInvoiceDraftFromInbound(businessId, user.id, documentId);
  } catch (error) {
    return { error: message(error, "The Purchase Invoice Draft could not be created.") };
  }
  revalidatePath(`/b/${businessId}/purchases/invoices`);
  refresh(businessId, documentId);
  redirect(`/b/${businessId}/purchases/invoices/${invoiceId}?notice=Draft created from electronic supplier invoice`);
}
