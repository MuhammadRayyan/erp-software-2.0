"use server";

import { deliveryNoteInputSchema } from "./delivery-note-input";
import { deleteDeliveryNote, saveDeliveryNote, voidDeliveryNote, type InventoryDocumentIntent } from "./delivery-note-service";
import { saveStockDocumentAction, stockDocumentCommandAction } from "@/modules/documents/engine/document-action-helpers";

const target = (businessId: string) => ({
  label: "Delivery Note",
  basePath: `/b/${businessId}/sales/delivery-notes`,
  schema: deliveryNoteInputSchema,
});

export async function saveDeliveryNoteAction(
  businessId: string,
  deliveryId: string | null,
  input: unknown,
  intent: InventoryDocumentIntent
) {
  return saveStockDocumentAction(target(businessId), businessId, deliveryId, input, intent, (userId, data, id) => saveDeliveryNote(businessId, userId, data, intent, id));
}

export async function voidDeliveryNoteAction(businessId: string, deliveryId: string) {
  return stockDocumentCommandAction(target(businessId), businessId, deliveryId, "void", (userId) => voidDeliveryNote(businessId, userId, deliveryId));
}

export async function deleteDeliveryNoteAction(businessId: string, deliveryId: string) {
  return stockDocumentCommandAction(target(businessId), businessId, deliveryId, "delete", (userId) => deleteDeliveryNote(businessId, userId, deliveryId));
}
