"use server";

import { goodsReceiptInputSchema } from "./goods-receipt-input";
import { deleteGoodsReceipt, saveGoodsReceipt, voidGoodsReceipt, type InventoryDocumentIntent } from "./goods-receipt-service";
import { saveStockDocumentAction, stockDocumentCommandAction } from "@/modules/documents/engine/document-action-helpers";

const target = (businessId: string) => ({
  label: "Goods Receipt",
  basePath: `/b/${businessId}/purchases/goods-receipts`,
  schema: goodsReceiptInputSchema,
});

export async function saveGoodsReceiptAction(
  businessId: string,
  receiptId: string | null,
  input: unknown,
  intent: InventoryDocumentIntent
) {
  return saveStockDocumentAction(target(businessId), businessId, receiptId, input, intent, (userId, data, id) => saveGoodsReceipt(businessId, userId, data, intent, id));
}

export async function voidGoodsReceiptAction(businessId: string, receiptId: string) {
  return stockDocumentCommandAction(target(businessId), businessId, receiptId, "void", (userId) => voidGoodsReceipt(businessId, userId, receiptId));
}

export async function deleteGoodsReceiptAction(businessId: string, receiptId: string) {
  return stockDocumentCommandAction(target(businessId), businessId, receiptId, "delete", (userId) => deleteGoodsReceipt(businessId, userId, receiptId));
}
