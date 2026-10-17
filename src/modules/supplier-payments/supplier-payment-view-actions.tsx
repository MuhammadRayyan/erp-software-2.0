"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voidSupplierPaymentAction } from "./actions";
import { DocumentViewActions } from "@/components/document-view-actions";

export function SupplierPaymentViewActions({
  businessId, paymentId, paymentNumber, status,
}: {
  businessId: string; paymentId: string; paymentNumber: string; status: "posted" | "void";
}) {
  const router = useRouter();

  return (
    <DocumentViewActions
      documentNumber={paymentNumber}
      documentType="Payment"
      pdfHref={`/api/businesses/${businessId}/documents/purchase-payment/${paymentId}/pdf`}
      onVoid={status === "posted" ? {
        label: "Reverse Payment",
        description: "Are you sure you want to reverse this payment? The allocation and accounting effect will be undone.",
        action: async () => {
          const result = await voidSupplierPaymentAction(businessId, paymentId);
          if (result.error) throw new Error(result.error);
          toast.success("Payment reversed. The allocation and accounting effect are no longer active.");
          router.refresh();
        }
      } : undefined}
    />
  );
}
