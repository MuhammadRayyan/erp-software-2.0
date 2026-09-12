"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelPurchaseQuoteAction,
  closePurchaseQuoteAction,
  deletePurchaseQuoteAction,
  convertPurchaseQuoteToOrderAction,
  createPurchaseQuoteRevisionAction,
} from "./actions";
import type { PurchaseQuoteStatus } from "./purchase-quote-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function PurchaseQuoteViewActions({
  businessId,
  quoteId,
  quoteNumber,
  documentStatus,
}: {
  businessId: string;
  quoteId: string;
  quoteNumber: string;
  documentStatus: PurchaseQuoteStatus;
}) {
  const router = useRouter();
  const editable = documentStatus === "draft" || documentStatus === "sent";
  const [converting, setConverting] = useState(false);
  const [revising, setRevising] = useState(false);

  const handleConvert = async () => {
    setConverting(true);
    try {
      const result = await convertPurchaseQuoteToOrderAction(businessId, quoteId);
      if (result.error) throw new Error(result.error);
      toast.success("Purchase order created from quote.");
      router.push(`/b/${businessId}/purchases/orders/${result.orderId}`);
    } catch (err: any) {
      toast.error(err.message);
      setConverting(false);
    }
  };

  const handleRevise = async () => {
    setRevising(true);
    try {
      const result = await createPurchaseQuoteRevisionAction(businessId, quoteId);
      if (result.error) throw new Error(result.error);
      toast.success("New purchase quote revision created.");
      router.push(`/b/${businessId}/purchases/quotes/${result.quoteId}`);
    } catch (err: any) {
      toast.error(err.message);
      setRevising(false);
    }
  };

  return (
    <DocumentViewActions
      documentNumber={quoteNumber}
      documentType="Purchase Quote"
      editHref={editable ? `/b/${businessId}/purchases/quotes/${quoteId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/documents/purchase-quote/${quoteId}/pdf`}
      onClose={
        documentStatus === "sent"
          ? {
              label: "Accept quote",
              description: "The quote is marked as accepted.",
              action: async () => {
                const result = await closePurchaseQuoteAction(businessId, quoteId);
                if (result.error) throw new Error(result.error);
                toast.success("Purchase quote accepted.");
                router.refresh();
              },
            }
          : undefined
      }
      onVoid={
        editable
          ? {
              label: "Cancel quote",
              description: "The quote will be retained as cancelled.",
              action: async () => {
                const result = await cancelPurchaseQuoteAction(businessId, quoteId);
                if (result.error) throw new Error(result.error);
                toast.success("Purchase quote cancelled.");
                router.refresh();
              },
            }
          : undefined
      }
      onDelete={
        documentStatus === "draft"
          ? {
              label: "Delete draft",
              description: "This permanently removes the draft purchase quote.",
              action: async () => {
                const result = await deletePurchaseQuoteAction(businessId, quoteId);
                if (result.error) throw new Error(result.error);
                toast.success("Draft purchase quote deleted.");
                router.push(`/b/${businessId}/purchases/quotes`);
              },
            }
          : undefined
      }
      extraPrimaryActions={
        <>
          {documentStatus !== "cancelled" && documentStatus !== "superseded" && (
            <Button variant="secondary" onClick={handleRevise} disabled={revising}>
              <GitBranch className={`size-4 ${revising ? "animate-spin" : ""}`} />
              New Revision
            </Button>
          )}
          {(documentStatus === "sent" || documentStatus === "accepted") && (
            <Button variant="secondary" onClick={handleConvert} disabled={converting}>
              <RefreshCw className={`size-4 ${converting ? "animate-spin" : ""}`} />
              Convert to Order
            </Button>
          )}
        </>
      }
    />
  );
}
