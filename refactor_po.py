file_path = "src/modules/purchase-orders/purchase-order-view-actions.tsx"
new_content = """"use client";

import Link from "next/link";
import { FilePlus2, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelPurchaseOrderAction, closePurchaseOrderAction, deletePurchaseOrderAction } from "./actions";
import type { PurchaseOrderStatus } from "./purchase-order-service";
import { DocumentViewActions } from "@/components/document-view-actions";

export function PurchaseOrderViewActions({
  businessId, orderId, orderNumber, status, inventoryEnabled, hasReceivableItems
}: {
  businessId: string; orderId: string; orderNumber: string; status: PurchaseOrderStatus; inventoryEnabled: boolean; hasReceivableItems: boolean
}) {
  const router = useRouter();
  const editable = status === "draft" || status === "issued";

  return (
    <DocumentViewActions
      documentNumber={orderNumber}
      documentType="Purchase Order"
      editHref={editable ? `/b/${businessId}/purchases/orders/${orderId}/edit` : undefined}
      pdfHref={`/api/businesses/${businessId}/documents/purchase-order/${orderId}/pdf`}
      onClose={status === "issued" ? {
        label: "Close order",
        description: "The order remains available for history and linked bills.",
        action: async () => {
          const result = await closePurchaseOrderAction(businessId, orderId);
          if (result.error) throw new Error(result.error);
          toast.success("Purchase order closed.");
          router.refresh();
        }
      } : undefined}
      onVoid={editable ? {
        label: "Cancel order",
        description: "The order will be retained without any ledger impact.",
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
      extraPrimaryActions={
        <>
          {inventoryEnabled && hasReceivableItems && status !== "cancelled" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/goods-receipts/new?orderId=${orderId}`}><PackagePlus className="size-4" /> Receive Goods</Link>
            </Button>
          )}
          {status !== "cancelled" && (
            <Button asChild variant="secondary">
              <Link href={`/b/${businessId}/purchases/invoices/new?orderId=${orderId}`}><FilePlus2 className="size-4" /> Create Purchase Invoice</Link>
            </Button>
          )}
        </>
      }
    />
  );
}
"""
with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
