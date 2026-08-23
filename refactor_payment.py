file_path = "src/modules/supplier-payments/supplier-payment-view-actions.tsx"
new_content = """"use client";

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

  if (status !== "posted") return null;

  return (
    <DocumentViewActions
      documentNumber={paymentNumber}
      documentType="Payment"
      onVoid={{
        label: "Reverse Payment",
        description: "Are you sure you want to reverse this payment? The allocation and accounting effect will be undone.",
        action: async () => {
          const result = await voidSupplierPaymentAction(businessId, paymentId);
          if (result.error) throw new Error(result.error);
          toast.success("Payment reversed. The allocation and accounting effect are no longer active.");
          router.refresh();
        }
      }}
    />
  );
}
"""
with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
