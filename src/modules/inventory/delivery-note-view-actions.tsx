"use client";

import { deleteDeliveryNoteAction, voidDeliveryNoteAction } from "./delivery-note-actions";
import type { InventoryDocumentStatus } from "./inventory-document";
import { StockDocumentViewActions } from "./stock-document-actions-ui";

export function DeliveryNoteViewActions({ businessId, deliveryId, number, status }: { businessId: string; deliveryId: string; number: string; status: InventoryDocumentStatus; journalId?: string | null }) {
  return (
    <StockDocumentViewActions
      number={number}
      status={status}
      basePath={`/b/${businessId}/sales/delivery-notes`}
      documentId={deliveryId}
      pdfHref={`/api/businesses/${businessId}/documents/delivery-note/${deliveryId}/pdf`}
      voidAction={() => voidDeliveryNoteAction(businessId, deliveryId)}
      deleteAction={() => deleteDeliveryNoteAction(businessId, deliveryId)}
      text={{
        deleted: "Draft Delivery Note deleted.",
        voided: "Delivery Note voided and COGS reversed.",
        voidDescription: "Stock will return and the Cost of Sales journal will be reversed.",
        voidButton: "Void delivery",
      }}
    />
  );
}
