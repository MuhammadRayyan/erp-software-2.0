"use client";

import { DocumentRevisionSwitcher } from "@/components/documents/document-revision-switcher";
import type { PurchaseOrderStatus } from "./purchase-order-service";

export type OrderRevisionItem = {
  id: string;
  order_number: string;
  revision_number: number;
  is_latest_revision: number;
  document_status: PurchaseOrderStatus;
  total_minor: number;
  currency_code: string;
  order_date: string;
};

export function OrderRevisionSwitcher({
  businessId,
  currentOrderId,
  revisions,
}: {
  businessId: string;
  currentOrderId: string;
  revisions: OrderRevisionItem[];
}) {
  return (
    <DocumentRevisionSwitcher
      currentId={currentOrderId}
      baseHref={`/b/${businessId}/purchases/orders`}
      revisions={revisions.map((rev) => ({
        id: rev.id,
        documentNumber: rev.order_number,
        revisionNumber: rev.revision_number,
        isLatestRevision: Boolean(rev.is_latest_revision),
        documentStatus: rev.document_status,
        totalMinor: rev.total_minor,
        currencyCode: rev.currency_code,
        documentDate: rev.order_date,
      }))}
    />
  );
}
