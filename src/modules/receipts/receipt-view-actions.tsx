"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentViewActions } from "@/components/document-view-actions";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import {
  deleteDraftReceiptAction,
  submitOrPostDraftReceiptAction,
  voidReceiptAction,
} from "./actions";

export function ReceiptViewActions({
  businessId,
  receiptId,
  receiptNumber,
  status,
}: {
  businessId: string;
  receiptId: string;
  receiptNumber: string;
  status: "draft" | "pending_approval" | "posted" | "void";
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitOrPost = async () => {
    setSubmitting(true);
    try {
      const result = await submitOrPostDraftReceiptAction(
        businessId,
        receiptId,
        mustSubmitForApproval ? "submit_approval" : "post",
      );
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
      toast.success(
        result.documentStatus === "pending_approval"
          ? "Receipt submitted for approval."
          : "Receipt posted to ledger.",
      );
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not submit receipt.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DocumentViewActions
      documentNumber={receiptNumber}
      documentType="Receipt"
      pdfHref={`/api/businesses/${businessId}/documents/sales-receipt/${receiptId}/pdf`}
      extraPrimaryActions={
        status === "draft" ? (
          <Button
            permission={mustSubmitForApproval ? "edit" : "post"}
            disabled={submitting}
            onClick={handleSubmitOrPost}
          >
            <CheckCircle2 className="size-4" />
            {submitting
              ? mustSubmitForApproval
                ? "Submitting..."
                : "Posting..."
              : mustSubmitForApproval
                ? "Submit for Approval"
                : "Post Receipt"}
          </Button>
        ) : undefined
      }
      onDelete={
        status === "draft"
          ? {
              label: "Delete draft",
              description:
                "This draft receipt has no journal entries and will be permanently removed.",
              action: async () => {
                const res = await deleteDraftReceiptAction(businessId, receiptId);
                if (res.error) throw new Error(res.error);
                broadcastLiveRefresh();
                toast.success("Draft receipt deleted.");
                router.push(`/b/${businessId}/sales/receipts`);
              },
            }
          : undefined
      }
      onVoid={
        status === "posted"
          ? {
              label: "Reverse Receipt",
              description:
                "This posts a full reversing journal and re-opens the customer invoices settled by this receipt.",
              action: async () => {
                const res = await voidReceiptAction(businessId, receiptId);
                if (res.error) throw new Error(res.error);
                toast.success("Receipt reversed.");
                router.refresh();
              },
            }
          : undefined
      }
    />
  );
}
