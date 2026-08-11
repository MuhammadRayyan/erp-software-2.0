"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { deleteGoodsReceipt, saveGoodsReceipt, voidGoodsReceipt, type InventoryDocumentIntent } from "./goods-receipt-service";
import { goodsReceiptInputSchema } from "./goods-receipt-input";
import { inventoryErrorMessage } from "./inventory-error";
export async function saveGoodsReceiptAction(businessId: string, receiptId: string | null, input: unknown, intent: InventoryDocumentIntent) { const { user } = await requireModule(businessId, "inventory"); const parsed = goodsReceiptInputSchema.safeParse(input); if (!parsed.success) return { error: "Check the Goods Receipt fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors }; let id: string; try { id = saveGoodsReceipt(businessId, user.id, parsed.data, intent, receiptId ?? undefined); } catch (error) { return { error: inventoryErrorMessage(error, "The Goods Receipt could not be saved.") }; } redirect(`/b/${businessId}/purchases/goods-receipts/${id}?notice=${intent === "post" ? "Goods Receipt posted" : "Draft saved"}`); }
export async function voidGoodsReceiptAction(businessId: string, receiptId: string) { const { user } = await requireModule(businessId, "inventory"); try { voidGoodsReceipt(businessId, user.id, receiptId); revalidatePath(`/b/${businessId}/purchases/goods-receipts/${receiptId}`); return {}; } catch (error) { return { error: inventoryErrorMessage(error, "The Goods Receipt could not be voided.") }; } }
export async function deleteGoodsReceiptAction(businessId: string, receiptId: string) { const { user } = await requireModule(businessId, "inventory"); try { deleteGoodsReceipt(businessId, user.id, receiptId); return {}; } catch (error) { return { error: inventoryErrorMessage(error, "The Goods Receipt could not be deleted.") }; } }
