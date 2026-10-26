"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSavePermission, requirePermission } from "@/core/permissions/require-module";
import { deliveryNoteInputSchema } from "./delivery-note-input";
import { deleteDeliveryNote, saveDeliveryNote, voidDeliveryNote, type InventoryDocumentIntent } from "./delivery-note-service";
import { inventoryErrorMessage } from "./inventory-error";

export async function saveDeliveryNoteAction(
  businessId: string,
  deliveryId: string | null,
  input: unknown,
  intent: InventoryDocumentIntent
) {
  const { user } = await requireSavePermission(businessId, "inventory", deliveryId, intent);
  const parsed = deliveryNoteInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the Delivery Note fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  let id: string;
  try {
    id = saveDeliveryNote(businessId, user.id, parsed.data, intent, deliveryId ?? undefined);
  } catch (error) {
    return { error: inventoryErrorMessage(error, "The Delivery Note could not be saved.") };
  }
  revalidatePath(`/b/${businessId}/sales/delivery-notes`);
  if (deliveryId) revalidatePath(`/b/${businessId}/sales/delivery-notes/${deliveryId}`);
  revalidatePath(`/b/${businessId}/sales/delivery-notes/${id}`);
  redirect(`/b/${businessId}/sales/delivery-notes/${id}?notice=${intent === "post" ? "Delivery Note posted" : "Draft saved"}`);
}

export async function voidDeliveryNoteAction(businessId: string, deliveryId: string) {
  const { user } = await requirePermission(businessId, "inventory", "delete");
  try {
    voidDeliveryNote(businessId, user.id, deliveryId);
    revalidatePath(`/b/${businessId}/sales/delivery-notes`);
    revalidatePath(`/b/${businessId}/sales/delivery-notes/${deliveryId}`);
    return {};
  } catch (error) {
    return { error: inventoryErrorMessage(error, "The Delivery Note could not be voided.") };
  }
}

export async function deleteDeliveryNoteAction(businessId: string, deliveryId: string) {
  const { user } = await requirePermission(businessId, "inventory", "delete");
  try {
    deleteDeliveryNote(businessId, user.id, deliveryId);
    revalidatePath(`/b/${businessId}/sales/delivery-notes`);
    return {};
  } catch (error) {
    return { error: inventoryErrorMessage(error, "The Delivery Note could not be deleted.") };
  }
}
