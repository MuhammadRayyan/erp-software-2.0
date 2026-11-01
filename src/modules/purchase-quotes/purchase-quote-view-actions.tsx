"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitBranch, RefreshCw, Send, ShoppingCart, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelPurchaseQuoteAction,
  closePurchaseQuoteAction,
  deletePurchaseQuoteAction,
  convertPurchaseQuoteToOrderAction,
  createPurchaseQuoteRevisionAction,
  issuePurchaseQuoteAction,
} from "./actions";
import type { PurchaseQuoteStatus } from "./purchase-quote-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { DocumentEmailDialog, type DocumentEmailDefaults } from "@/modules/email/email-compose-dialog";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";

export function PurchaseQuoteViewActions({
  businessId,
  quoteId,
  quoteNumber,
  documentStatus,
  emailDefaults,
  linkedOrder,
}: {
  businessId: string;
  quoteId: string;
  quoteNumber: string;
  documentStatus: PurchaseQuoteStatus;
  emailDefaults: DocumentEmailDefaults;
  linkedOrder?: { id: string; order_number: string };
}) {
  const router = useRouter();
  const editable = documentStatus === "draft" || documentStatus === "sent";
  const [issuing, setIssuing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const handleIssue = async () => {
    setIssuing(true);
    try {
      const result = await issuePurchaseQuoteAction(businessId, quoteId);
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
      toast.success("Purchase quote issued.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIssuing(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const result = await convertPurchaseQuoteToOrderAction(businessId, quoteId);
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
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
      broadcastLiveRefresh();
      toast.success("New purchase quote revision created.");
      router.push(`/b/${businessId}/purchases/quotes/${result.quoteId}`);
    } catch (err: any) {
      toast.error(err.message);
      setRevising(false);
    }
  };

  return (
    <>
      <DocumentViewActions
        documentNumber={quoteNumber}
        documentType="Purchase Quote"
        editHref={editable ? `/b/${businessId}/purchases/quotes/${quoteId}/edit` : undefined}
        pdfHref={`/api/businesses/${businessId}/documents/purchase-quote/${quoteId}/pdf`}
        onEmail={() => setEmailOpen(true)}
        copyToActions={documentStatus !== "cancelled" && documentStatus !== "superseded" ? [
          ...(documentStatus !== "accepted" && !linkedOrder ? [{
            label: "Purchase Order",
            href: `/b/${businessId}/purchases/orders/new?quoteId=${quoteId}`,
            icon: ShoppingCart,
          }] : []),
          {
            label: "Purchase Invoice",
            href: `/b/${businessId}/purchases/invoices/new?quoteId=${quoteId}`,
            icon: ReceiptText,
          },
        ] : undefined}
        onClose={
          documentStatus === "sent"
            ? {
                label: "Accept quote",
                description: "The quote is marked as accepted.",
                action: async () => {
                  const result = await closePurchaseQuoteAction(businessId, quoteId);
                  if (result.error) throw new Error(result.error);
                  broadcastLiveRefresh();
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
                  broadcastLiveRefresh();
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
                  broadcastLiveRefresh();
                  toast.success("Draft purchase quote deleted.");
                  router.push(`/b/${businessId}/purchases/quotes`);
                  router.refresh();
                },
              }
            : undefined
        }
        extraPrimaryActions={
          <>
            {documentStatus === "draft" && (
              <Button permission={"approve"} onClick={handleIssue} disabled={issuing} className="gap-1.5">
                <Send className={`size-4 ${issuing ? "animate-spin" : ""}`} />
                Issue Quote
              </Button>
            )}
            {documentStatus !== "cancelled" && documentStatus !== "superseded" && (
              <Button variant="secondary" onClick={handleRevise} disabled={revising}>
                <GitBranch className={`size-4 ${revising ? "animate-spin" : ""}`} />
                New Revision
              </Button>
            )}
            {linkedOrder || documentStatus === "accepted" ? (
              <Button asChild variant="secondary" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
                <Link href={linkedOrder ? `/b/${businessId}/purchases/orders/${linkedOrder.id}` : `/b/${businessId}/purchases/orders`}>
                  <ShoppingCart className="size-4 text-primary" />
                  {linkedOrder ? `Order: ${linkedOrder.order_number}` : "View Linked Order"}
                </Link>
              </Button>
            ) : documentStatus === "sent" ? (
              <Button variant="secondary" onClick={handleConvert} disabled={converting}>
                <RefreshCw className={`size-4 ${converting ? "animate-spin" : ""}`} />
                Convert to Order
              </Button>
            ) : null}
          </>
        }
      />
      <DocumentEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        businessId={businessId}
        documentType="purchase-quote"
        documentId={quoteId}
        documentNumber={quoteNumber}
        defaults={emailDefaults}
        pdfAvailable
      />
    </>
  );
}
