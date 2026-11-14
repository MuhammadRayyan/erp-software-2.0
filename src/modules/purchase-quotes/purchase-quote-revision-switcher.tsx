"use client";

import { DocumentRevisionSwitcher } from "@/components/documents/document-revision-switcher";
import type { PurchaseQuoteStatus } from "./purchase-quote-service";

export type PurchaseQuoteRevisionItem = {
  id: string;
  quote_number: string;
  revision_number: number;
  is_latest_revision: number;
  document_status: PurchaseQuoteStatus;
  total_minor: number;
  currency_code: string;
  quote_date: string;
};

export function PurchaseQuoteRevisionSwitcher({
  businessId,
  currentQuoteId,
  revisions,
}: {
  businessId: string;
  currentQuoteId: string;
  revisions: PurchaseQuoteRevisionItem[];
}) {
  return (
    <DocumentRevisionSwitcher
      currentId={currentQuoteId}
      baseHref={`/b/${businessId}/purchases/quotes`}
      revisions={revisions.map((rev) => ({
        id: rev.id,
        documentNumber: rev.quote_number,
        revisionNumber: rev.revision_number,
        isLatestRevision: Boolean(rev.is_latest_revision),
        documentStatus: rev.document_status,
        totalMinor: rev.total_minor,
        currencyCode: rev.currency_code,
        documentDate: rev.quote_date,
      }))}
    />
  );
}
