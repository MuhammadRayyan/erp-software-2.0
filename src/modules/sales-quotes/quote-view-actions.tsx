// @ts-nocheck
"use client";

import Link from "next/link";
import { FilePlus2, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelSalesQuoteAction, closeSalesQuoteAction, deleteSalesQuoteAction } from "./actions";
import type { SalesQuoteStatus } from "./quote-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function SalesQuoteViewActions({
  businessId, quoteId, quoteNumber, documentStatus, inventoryEnabled, hasReceivableItems
}: {
  businessId: string; quoteId: string; quoteNumber: string; documentStatus: SalesQuoteStatus; inventoryEnabled: boolean; hasReceivableItems: boolean
}) {
  const router = useRouter();
  const editable = documentStatus === "draft" || documentStatus === "issued";

  return (
    <DocumentViewActions
      documentNumber={quoteNumber}
      documentType="Purchase Quote"
      editHref={editable ? `/b/${businessId}/purchases/quotes/${quoteId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/documents/quote/${quoteId}/pdf`}
      onClose={documentStatus === "issued" ? {
        label: "Close quote",
        description: "The quote remains available for history and linked bills.",
        action: async () => {
          const result = await closeSalesQuoteAction(businessId, quoteId);
          if (result.error) throw new Error(result.error);
          toast.success("Purchase quote closed.");
          router.refresh();
        }
      } : undefined}
      onVoid={editable ? {
        label: "Cancel quote",
        description: "The quote will be retained without any ledger impact.",
        action: async () => {
          const result = await cancelSalesQuoteAction(businessId, quoteId);
          if (result.error) throw new Error(result.error);
          toast.success("Purchase quote cancelled.");
          router.refresh();
        }
      } : undefined}
      onDelete={documentStatus === "draft" ? {
        label: "Delete draft",
        description: "This permanently removes the draft purchase quote.",
        action: async () => {
          const result = await deleteSalesQuoteAction(businessId, quoteId);
          if (result.error) throw new Error(result.error);
          toast.success("Draft purchase quote deleted.");
          router.push(`/b/${businessId}/purchases/quotes`);
        }
      } : undefined}
      extraPrimaryActions={
        <>
          {inventoryEnabled && hasReceivableItems && documentStatus !== "cancelled" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/goods-receipts/new?quoteId=${quoteId}`}><PackagePlus className="size-4" /> Receive Goods</Link>
            </Button>
          )}
          {documentStatus !== "cancelled" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/invoices/new?quoteId=${quoteId}`}><FilePlus2 className="size-4" /> Create Purchase Invoice</Link>
            </Button>
          )}
        </>
      }
    />
  );
}
