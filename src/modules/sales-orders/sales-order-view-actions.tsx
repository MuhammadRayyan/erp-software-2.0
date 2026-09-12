"use client";

import Link from "next/link";
import { Truck, RefreshCw, GitBranch, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelSalesOrderAction, closeSalesOrderAction, deleteSalesOrderAction, convertSalesOrderToInvoiceAction, createSalesOrderRevisionAction } from "./actions";
import type { SalesOrderStatus } from "./sales-order-service";
import { DocumentViewActions } from "@/components/document-view-actions";
import { useState } from "react";
import { DocumentEmailDialog, type DocumentEmailDefaults } from "@/modules/email/email-compose-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function SalesOrderViewActions({
  businessId, orderId, orderNumber, documentStatus, inventoryEnabled, hasDeliverableItems, emailDefaults
}: {
  businessId: string;
  orderId: string;
  orderNumber: string;
  documentStatus: SalesOrderStatus;
  inventoryEnabled: boolean;
  hasDeliverableItems: boolean;
  emailDefaults: DocumentEmailDefaults;
}) {
  const router = useRouter();
  const editable = documentStatus === "draft" || documentStatus === "active";
  const [converting, setConverting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

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
            {documentStatus !== "cancelled" && documentStatus !== "superseded" && (
              <Button variant="secondary" onClick={handleRevise} disabled={revising}>
                <GitBranch className={`size-4 ${revising ? "animate-spin" : ""}`} />
                New Revision
              </Button>
            )}
            {inventoryEnabled && hasDeliverableItems && documentStatus !== "cancelled" && documentStatus !== "superseded" && (
              <Button asChild variant="secondary">
                <Link href={`/b/${businessId}/sales/delivery-notes/new?orderId=${orderId}`}>
                  <Truck className="size-4 mr-2" /> Ship Goods
                </Link>
              </Button>
            )}
            {(documentStatus === "active" || documentStatus === "completed") && (
              <Button variant="secondary" onClick={handleConvert} disabled={converting}>
                <RefreshCw className={`size-4 ${converting ? "animate-spin" : ""}`} />
                Convert to Invoice
              </Button>
            )}
          </>
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
