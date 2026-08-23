file_path = "src/modules/receipts/receipt-view-actions.tsx"
new_content = """"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { voidReceiptAction } from "./actions";
import { DocumentViewActions } from "@/components/document-view-actions";

export function ReceiptViewActions({
  businessId, receiptId, receiptNumber, status,
}: {
  businessId: string; receiptId: string; receiptNumber: string; status: "posted" | "void";
}) {
  const router = useRouter();

  if (status !== "posted") return null;

  return (
    <DocumentViewActions
      documentNumber={receiptNumber}
      documentType="Receipt"
      onVoid={{
        label: "Reverse Receipt",
        description: "Are you sure you want to reverse this receipt? The allocation and accounting effect will be undone.",
        action: async () => {
          const result = await voidReceiptAction(businessId, receiptId);
          if (result.error) throw new Error(result.error);
          toast.success("Receipt reversed. The allocation and accounting effect are no longer active.");
          router.refresh();
        }
      }}
    />
  );
}
"""
with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)
