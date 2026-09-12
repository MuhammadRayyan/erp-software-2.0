"use client";

import Link from "next/link";
import { PackagePlus, RefreshCw, GitBranch, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelPurchaseOrderAction, closePurchaseOrderAction, deletePurchaseOrderAction, convertPurchaseOrderToInvoiceAction, createPurchaseOrderRevisionAction } from "./actions";
import type { PurchaseOrderStatus } from "./purchase-order-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { useState } from "react";
import { DocumentEmailDialog, type DocumentEmailDefaults } from "@/modules/email/email-compose-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function PurchaseOrderViewActions({
  businessId, orderId, orderNumber, status, inventoryEnabled, hasReceivableItems, emailDefaults
}: {
  businessId: string; orderId: string; orderNumber: string; status: PurchaseOrderStatus; inventoryEnabled: boolean; hasReceivableItems: boolean; emailDefaults: DocumentEmailDefaults;
}) {
  const router = useRouter();
  const editable = status === "draft" || status === "issued";
  const [converting, setConverting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const handleRevise = async () => {
    setRevising(true);
    try {
      const result = await createPurchaseOrderRevisionAction(businessId, orderId);
      if (result.error) throw new Error(result.error);
      toast.success("New order revision created.");
      router.push(`/b/${businessId}/purchases/orders/${result.orderId}`);
    } catch (err: any) {
      toast.error(err.message);
      setRevising(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const result = await convertPurchaseOrderToInvoiceAction(businessId, orderId);
      if (result.error) throw new Error(result.error);
      toast.success("Purchase invoice created.");
      router.push(`/b/${businessId}/purchases/invoices/${result.invoiceId}`);
    } catch (err: any) {
      toast.error(err.message);
      setConverting(false);
    }
  };

  return (
    <>
      <DocumentViewActions
        documentNumber={orderNumber}
        documentType="Purchase Order"
        editHref={editable ? `/b/${businessId}/purchases/orders/${orderId}/edit` : undefined}
        pdfHref={`/api/businesses/${businessId}/documents/purchase-order/${orderId}/pdf`}
        onEmail={() => setEmailOpen(true)}
        onClose={status === "issued" ? {
          label: "Close order",
          description: "The order remains available for history.",
          action: async () => {
            const result = await closePurchaseOrderAction(businessId, orderId);
            if (result.error) throw new Error(result.error);
            toast.success("Purchase order closed.");
            router.refresh();
          }
        } : undefined}
        onVoid={editable ? {
          label: "Cancel order",
          description: "The order will be retained as cancelled.",
          action: async () => {
            const result = await cancelPurchaseOrderAction(businessId, orderId);
            if (result.error) throw new Error(result.error);
            toast.success("Purchase order cancelled.");
            router.refresh();
          }
        } : undefined}
        onDelete={status === "draft" ? {
          label: "Delete draft",
          description: "This permanently removes the draft purchase order.",
          action: async () => {
            const result = await deletePurchaseOrderAction(businessId, orderId);
            if (result.error) throw new Error(result.error);
            toast.success("Draft purchase order deleted.");
            router.push(`/b/${businessId}/purchases/orders`);
          }
        } : undefined}
        extraActions={
          <>
            <DropdownMenuItem onSelect={() => setEmailOpen(true)}>
              <Mail className="size-4 mr-2" /> Email
            </DropdownMenuItem>
          </>
        }
        extraPrimaryActions={
          <>
            <Button variant="secondary" onClick={() => setEmailOpen(true)}>
              <Mail className="mr-1.5 size-3.5" /> Email
            </Button>
            {status !== "cancelled" && status !== "superseded" && (
              <Button variant="secondary" onClick={handleRevise} disabled={revising}>
                <GitBranch className={`size-4 ${revising ? "animate-spin" : ""}`} /> 
                New Revision
              </Button>
            )}
            {status === "issued" && inventoryEnabled && (
              <Button asChild variant="secondary" disabled={!hasReceivableItems}>
                <Link href={`/b/${businessId}/purchases/receipts/new?orderId=${orderId}`}><PackagePlus className="size-4 mr-2" /> Receive Goods</Link>
              </Button>
            )}
            {status === "issued" && (
              <Button variant="secondary" onClick={handleConvert} disabled={converting}>
                <RefreshCw className={`size-4 ${converting ? "animate-spin" : ""}`} /> 
                Create Invoice
              </Button>
            )}
          </>
        }
      />
      <DocumentEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        businessId={businessId}
        documentType="purchase-order"
        documentId={orderId}
        documentNumber={orderNumber}
        defaults={emailDefaults}
        pdfAvailable
      />
    </>
  );
}
