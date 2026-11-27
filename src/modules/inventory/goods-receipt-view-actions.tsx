"use client";

import { deleteGoodsReceiptAction, voidGoodsReceiptAction } from "./goods-receipt-actions";
import type { InventoryDocumentStatus } from "./inventory-document";
import { StockDocumentViewActions } from "./stock-document-actions-ui";

export function GoodsReceiptViewActions({ businessId, receiptId, number, status }: { businessId: string; receiptId: string; number: string; status: InventoryDocumentStatus }) {
  return (
    <StockDocumentViewActions
      number={number}
      status={status}
      basePath={`/b/${businessId}/purchases/goods-receipts`}
      documentId={receiptId}
      pdfHref={`/api/businesses/${businessId}/documents/goods-receipt/${receiptId}/pdf`}
      voidAction={() => voidGoodsReceiptAction(businessId, receiptId)}
      deleteAction={() => deleteGoodsReceiptAction(businessId, receiptId)}
      text={{
        deleted: "Draft Goods Receipt deleted.",
        voided: "Goods Receipt voided.",
        voidDescription: "The receipt stays in history and stock is reversed. This is blocked if the stock has already been consumed.",
        voidButton: "Void receipt",
      }}
    />
  );
}
