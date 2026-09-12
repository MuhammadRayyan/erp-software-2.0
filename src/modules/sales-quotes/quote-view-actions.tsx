"use client";

import Link from "next/link";
import { GitBranch, ReceiptText, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelSalesQuoteAction, closeSalesQuoteAction, deleteSalesQuoteAction, convertSalesQuoteToOrderAction, createSalesQuoteRevisionAction } from "./actions";
import type { SalesQuoteStatus } from "./quote-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { useState } from "react";

export function SalesQuoteViewActions({
  businessId, quoteId, quoteNumber, documentStatus
}: {
  businessId: string; quoteId: string; quoteNumber: string; documentStatus: SalesQuoteStatus;
}) {
  const router = useRouter();
  const editable = documentStatus === "draft" || documentStatus === "sent";
  const [converting, setConverting] = useState(false);
  const [revising, setRevising] = useState(false);

  const handleConvert = async () => {
    setConverting(true);
    try {
      const result = await convertSalesQuoteToOrderAction(businessId, quoteId);
      if (result.error) throw new Error(result.error);
      toast.success("Sales order created.");
      router.push(`/b/${businessId}/sales/orders/${result.orderId}`);
    } catch (err: any) {
      toast.error(err.message);
      setConverting(false);
    }
  };

  const handleRevise = async () => {
    setRevising(true);
    try {
      const result = await createSalesQuoteRevisionAction(businessId, quoteId);
      if (result.error) throw new Error(result.error);
      toast.success("New quote revision created.");
      router.push(`/b/${businessId}/sales/quotes/${result.quoteId}`);
    } catch (err: any) {
      toast.error(err.message);
      setRevising(false);
    }
  };

  return (
    <DocumentViewActions
      documentNumber={quoteNumber}
      documentType="Sales Quote"
      editHref={editable ? `/b/${businessId}/sales/quotes/${quoteId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/documents/sales-quote/${quoteId}/pdf`}
      onClose={documentStatus === "sent" ? {
        label: "Close quote",
        description: "The quote remains available for history.",
        action: async () => {
          const result = await closeSalesQuoteAction(businessId, quoteId);
          if (result.error) throw new Error(result.error);
          toast.success("Sales quote closed.");
          router.refresh();
        }
      } : undefined}
      onVoid={editable ? {
        label: "Cancel quote",
        description: "The quote will be retained as cancelled.",
        action: async () => {
          const result = await cancelSalesQuoteAction(businessId, quoteId);
          if (result.error) throw new Error(result.error);
          toast.success("Sales quote cancelled.");
          router.refresh();
        }
      } : undefined}
      onDelete={documentStatus === "draft" ? {
        label: "Delete draft",
        description: "This permanently removes the draft sales quote.",
        action: async () => {
          const result = await deleteSalesQuoteAction(businessId, quoteId);
          if (result.error) throw new Error(result.error);
          toast.success("Draft sales quote deleted.");
          router.push(`/b/${businessId}/sales/quotes`);
        }
      } : undefined}
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
          {documentStatus !== "cancelled" && documentStatus !== "superseded" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/sales/invoices/new?quoteId=${quoteId}`}><ReceiptText className="size-4" /> Create Invoice</Link>
            </Button>
          )}
        </>
      }
    />
  );
}
