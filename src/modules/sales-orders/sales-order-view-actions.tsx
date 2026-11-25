"use client";

import Link from "next/link";
import { CheckCircle2, Truck, RefreshCw, GitBranch, ReceiptText, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useActionPermission } from "@/components/permissions-provider";
import { cancelSalesOrderAction, closeSalesOrderAction, deleteSalesOrderAction, convertSalesOrderToInvoiceAction, createSalesOrderRevisionAction, duplicateSalesOrderAction, issueSalesOrderAction } from "./actions";
import type { SalesOrderStatus } from "./sales-order-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { useState } from "react";
import { DocumentEmailDialog, type DocumentEmailDefaults } from "@/modules/email/email-compose-dialog";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";

export function SalesOrderViewActions({
  businessId, orderId, orderNumber, documentStatus, inventoryEnabled, hasDeliverableItems, emailDefaults, linkedInvoice
}: {
  businessId: string;
  orderId: string;
  orderNumber: string;
  documentStatus: SalesOrderStatus;
  inventoryEnabled: boolean;
  hasDeliverableItems: boolean;
  emailDefaults: DocumentEmailDefaults;
  linkedInvoice?: { id: string; invoice_number: string };
}) {
  const router = useRouter();
  const canCreate = useActionPermission("create");
  const canApprove = useActionPermission("approve");
  const canCreatePurchase = useActionPermission("create", "purchases");
  const canCreateInventory = useActionPermission("create", "inventory");
  const editable = documentStatus === "draft" || documentStatus === "active";
  const showActivate = documentStatus === "draft" && canApprove;
  const showRevise = documentStatus !== "cancelled" && documentStatus !== "superseded" && canCreate;
  const showShip = inventoryEnabled && hasDeliverableItems && documentStatus === "active" && canCreateInventory;
  const showInvoiceOrConvert = Boolean(linkedInvoice || documentStatus === "completed") || (documentStatus === "active" && canCreate);
  const hasExtraPrimary = showActivate || showRevise || showShip || showInvoiceOrConvert;
  const [issuing, setIssuing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const handleIssue = async () => {
    setIssuing(true);
    try {
      const result = await issueSalesOrderAction(businessId, orderId);
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
      toast.success("Sales order activated.");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIssuing(false);
    }
  };

  const handleRevise = async () => {
    setRevising(true);
    try {
      const result = await createSalesOrderRevisionAction(businessId, orderId);
      if (result.error) throw new Error(result.error);
      toast.success("New order revision created.");
      router.push(`/b/${businessId}/sales/orders/${result.orderId}`);
    } catch (err: any) {
      toast.error(err.message);
      setRevising(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const result = await convertSalesOrderToInvoiceAction(businessId, orderId);
      if (result.error) throw new Error(result.error);
      toast.success("Sales invoice created.");
      router.push(`/b/${businessId}/sales/invoices/${result.invoiceId}`);
    } catch (err: any) {
      toast.error(err.message);
      setConverting(false);
    }
  };

  return (
    <>
      <DocumentViewActions
        documentNumber={orderNumber}
        documentType="Sales Order"
        editHref={editable ? `/b/${businessId}/sales/orders/${orderId}/edit` : undefined}
        pdfHref={`/api/businesses/${businessId}/documents/sales-order/${orderId}/pdf`}
        onEmail={() => setEmailOpen(true)}
        onDuplicate={async () => {
          const result = await duplicateSalesOrderAction(businessId, orderId);
          if (result?.error) throw new Error(result.error);
        }}
        extraActions={
          (documentStatus === "active" || documentStatus === "completed") && canCreatePurchase ? (
            <DropdownMenuItem permission="create" permissionModule="purchases" asChild>
              <Link href={`/b/${businessId}/purchases/orders/new?salesOrderId=${orderId}`}>
                <ShoppingCart className="size-4" /> Create Back-to-Back PO
              </Link>
            </DropdownMenuItem>
          ) : undefined
        }
        onClose={documentStatus === "active" ? {
          label: "Close order",
          description: "The order remains available for history.",
          action: async () => {
            const result = await closeSalesOrderAction(businessId, orderId);
            if (result.error) throw new Error(result.error);
            toast.success("Sales order closed.");
            router.refresh();
          }
        } : undefined}
        onVoid={editable ? {
          label: "Cancel order",
          description: "The order will be retained as cancelled.",
          action: async () => {
            const result = await cancelSalesOrderAction(businessId, orderId);
            if (result.error) throw new Error(result.error);
            toast.success("Sales order cancelled.");
            router.refresh();
          }
        } : undefined}
        onDelete={documentStatus === "draft" ? {
          label: "Delete draft",
          description: "This permanently removes the draft sales order.",
          action: async () => {
            const result = await deleteSalesOrderAction(businessId, orderId);
            if (result.error) throw new Error(result.error);
            toast.success("Draft sales order deleted.");
            router.push(`/b/${businessId}/sales/orders`);
          }
        } : undefined}
        extraPrimaryActions={
          hasExtraPrimary ? (
            <>
              {documentStatus === "draft" && (
                <Button permission={"approve"} onClick={handleIssue} disabled={issuing} className="gap-1.5">
                  <CheckCircle2 className={`size-4 ${issuing ? "animate-spin" : ""}`} />
                  Activate Order
                </Button>
              )}
              {documentStatus !== "cancelled" && documentStatus !== "superseded" && (
                <Button permission="create" variant="secondary" onClick={handleRevise} disabled={revising}>
                  <GitBranch className={`size-4 ${revising ? "animate-spin" : ""}`} />
                  New Revision
                </Button>
              )}
              {inventoryEnabled && hasDeliverableItems && documentStatus === "active" && (
                <Button permission="create" permissionModule="inventory" asChild variant="secondary">
                  <Link href={`/b/${businessId}/sales/delivery-notes/new?orderId=${orderId}`}>
                    <Truck className="size-4 mr-2" /> Ship Goods
                  </Link>
                </Button>
              )}
              {linkedInvoice || documentStatus === "completed" ? (
                <Button asChild variant="secondary" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5">
                  <Link href={linkedInvoice ? `/b/${businessId}/sales/invoices/${linkedInvoice.id}` : `/b/${businessId}/sales/invoices`}>
                    <ReceiptText className="size-4 text-primary" />
                    {linkedInvoice ? `Invoice: ${linkedInvoice.invoice_number}` : "View Linked Invoice"}
                  </Link>
                </Button>
              ) : documentStatus === "active" ? (
                <Button permission="create" variant="secondary" onClick={handleConvert} disabled={converting}>
                  <RefreshCw className={`size-4 ${converting ? "animate-spin" : ""}`} />
                  Convert to Invoice
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />
      <DocumentEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        businessId={businessId}
        documentType="sales-order"
        documentId={orderId}
        documentNumber={orderNumber}
        defaults={emailDefaults}
        pdfAvailable
      />
    </>
  );
}
