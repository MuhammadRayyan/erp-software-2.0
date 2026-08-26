// @ts-nocheck
"use client";

import Link from "next/link";
import { FilePlus2, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelSalesOrderAction, closeSalesOrderAction, deleteSalesOrderAction } from "./actions";
import type { SalesOrderStatus } from "./sales-order-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function SalesOrderViewActions({
  businessId, orderId, orderNumber, documentStatus, inventoryEnabled, hasReceivableItems
}: {
  businessId: string; orderId: string; orderNumber: string; documentStatus: SalesOrderStatus; inventoryEnabled: boolean; hasReceivableItems: boolean
}) {
  const router = useRouter();
  const editable = documentStatus === "draft" || documentStatus === "issued";

  return (
    <DocumentViewActions
      documentNumber={orderNumber}
      documentType="Purchase Order"
      editHref={editable ? `/b/${businessId}/purchases/orders/${orderId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/documents/sales-order/${orderId}/pdf`}
      onClose={documentStatus === "issued" ? {
        label: "Close order",
        description: "The order remains available for history and linked bills.",
        action: async () => {
          const result = await closeSalesOrderAction(businessId, orderId);
          if (result.error) throw new Error(result.error);
          toast.success("Purchase order closed.");
          router.refresh();
        }
      } : undefined}
      onVoid={editable ? {
        label: "Cancel order",
        description: "The order will be retained without any ledger impact.",
        action: async () => {
          const result = await cancelSalesOrderAction(businessId, orderId);
          if (result.error) throw new Error(result.error);
          toast.success("Purchase order cancelled.");
          router.refresh();
        }
      } : undefined}
      onDelete={documentStatus === "draft" ? {
        label: "Delete draft",
        description: "This permanently removes the draft purchase order.",
        action: async () => {
          const result = await deleteSalesOrderAction(businessId, orderId);
          if (result.error) throw new Error(result.error);
          toast.success("Draft purchase order deleted.");
          router.push(`/b/${businessId}/purchases/orders`);
        }
      } : undefined}
      extraPrimaryActions={
        <>
          {inventoryEnabled && hasReceivableItems && documentStatus !== "cancelled" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/goods-receipts/new?orderId=${orderId}`}><PackagePlus className="size-4" /> Receive Goods</Link>
            </Button>
          )}
          {documentStatus !== "cancelled" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/invoices/new?orderId=${orderId}`}><FilePlus2 className="size-4" /> Create Purchase Invoice</Link>
            </Button>
          )}
        </>
      }
    />
  );
}
